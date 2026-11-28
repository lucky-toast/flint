#!/usr/bin/env node
// Token count for Flint's design inputs.
//
// Sends each design input in inputs/ to Muse's count endpoint
// (POST /v1/responses/input_tokens) and reports how many input tokens the
// request would use, at sizes from full down to ~1024 px on the long edge.
// The endpoint only tokenizes: nothing is generated, so no output tokens.
//
// Sources (see inputs/README.md):
//   pdf-text   PDF with selectable text. Sent three ways: as the PDF file
//              itself; as page images we render; as page images plus its
//              text layer. Plus the text layer alone.
//   pdf-flat   PDF with no text layer. As the file; as page images.
//   design     PNG of a design made on a computer.
//   sketch     Photo of a hand-sketched design.
// Every request also carries the same short prompt, and a prompt-only
// baseline is counted first, so "media tokens" = count - baseline.
//
// Caveat: meta-models/meta-model-cookbook#58 reports that this endpoint
// barely counts images and video (a 3000x2000 PNG counted ~171 tokens). The
// summary flags any media case whose delta looks too small to be real.
//
// API key: MODEL_API_KEY in token-count/.env (gitignored; copy .env.example).
//
// Usage:
//   node token-count.mjs --dry-run      prepare every case, print the plan, no calls
//   node token-count.mjs
//   node token-count.mjs --summarize=results/<timestamp>   rebuild summary.md, no calls
//
// Options (defaults in brackets):
//   --model=ID            [muse-ember-1.0]  (the app's model; counts are per model)
//   --sizes=a,b           long-edge px ladder; "full" = original [full,4096,3072,2048,1536,1024]
//                         sizes at or above a source's own size are skipped
//   --image-details=a,b   input_image detail: original,high,auto,low [original,auto]
//   --file-details=a,b    input_file detail for the PDF-as-file cases: low,high [low,high]
//   --pdf-dpi=N           "full" render resolution for PDF pages [300]
//   --max-pdf-pages=N     pages rendered per PDF (Muse keeps 50 page images) [50]
//   --jpeg-quality=N      re-encode quality for resized photos [90]
//   --only=ids            sources to include, e.g. design,sketch [all]
//   --prompt=TEXT         the text sent with every case
//   --inputs=DIR          [./inputs]
//   --save-media          also write every prepared image to results/<ts>/media/
//   --delay-ms=N          pause between calls [250]
//   --timeout-s=N         per-call HTTP timeout [120]
//   --max-retries=N       retries on 429 / 5xx / network errors [3]
//
// Output (results/<timestamp>/):
//   counts.jsonl   one line per case, appended as it returns: the request body
//                  with base64 data replaced by its size, HTTP status, count
//                  or error body, latency.
//   config.json    settings used (no API key).
//   sources.json   what was found in inputs/ (dimensions, pages, text layer).
//   results.json + summary.md   written at the end.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ENV_PATH = join(HERE, ".env");
if (existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH);

// ---------------- config ----------------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  }),
);
const int = (v, d) => (v === undefined ? d : Number.parseInt(v, 10));
const list = (v, d) => String(v ?? d).split(",").map((s) => s.trim()).filter(Boolean);

const CONFIG = {
  baseUrl: process.env.MODEL_API_BASE_URL ?? "https://api.meta.ai/v1",
  apiKey: process.env.MODEL_API_KEY,
  model: args.model ?? "muse-ember-1.0",
  sizes: list(args.sizes, "full,4096,3072,2048,1536,1024").map((s) => (s === "full" ? "full" : int(s))),
  imageDetails: list(args["image-details"], "original,auto"),
  fileDetails: list(args["file-details"], "low,high"),
  pdfDpi: int(args["pdf-dpi"], 300),
  maxPdfPages: int(args["max-pdf-pages"], 50),
  jpegQuality: int(args["jpeg-quality"], 90),
  only: args.only ? list(args.only) : null,
  prompt: args.prompt ?? "This is a packing-slip design. Describe its layout, section by section.",
  inputsDir: args.inputs ? String(args.inputs) : join(HERE, "inputs"),
  saveMedia: Boolean(args["save-media"]),
  delayMs: int(args["delay-ms"], 250),
  timeoutMs: int(args["timeout-s"], 120) * 1000,
  maxRetries: int(args["max-retries"], 3),
  dryRun: Boolean(args["dry-run"]),
};

const INLINE_LIMIT = 50 * 1024 * 1024; // Muse's inline payload limit per file
// A media case whose delta over baseline is below this is suspicious (see #58).
const SUSPICIOUS_MEDIA_DELTA = 300;

// ---------------- helpers ----------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtBytes = (n) => (n == null ? "" : n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

/** The request body with every base64 payload replaced by its length, for logging. */
function redact(body) {
  return JSON.parse(
    JSON.stringify(body, (_k, v) =>
      typeof v === "string" && v.startsWith("data:") ? `${v.slice(0, v.indexOf(",") + 1)}<${v.length} chars>` : v,
    ),
  );
}

async function countTokens(body) {
  let lastErr;
  for (let attempt = 0; attempt <= CONFIG.maxRetries; attempt++) {
    const started = Date.now();
    try {
      const res = await fetch(`${CONFIG.baseUrl}/responses/input_tokens`, {
        method: "POST",
        headers: { Authorization: `Bearer ${CONFIG.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(CONFIG.timeoutMs),
      });
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text };
      }
      const out = { status: res.status, ms: Date.now() - started, attempt, response: json };
      if (res.ok) return out;
      if (res.status !== 429 && res.status < 500) return out; // 4xx: retrying won't help
      lastErr = out;
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt);
    } catch (err) {
      lastErr = { status: 0, ms: Date.now() - started, attempt, error: String(err) };
      await sleep(1000 * 2 ** attempt);
    }
  }
  return lastErr;
}

function summarize(rows, sources, warnings, cfg = CONFIG) {
  const base = rows.find((r) => r.id === "baseline")?.inputTokens;
  const lines = [
    `# Token count — ${cfg.model}`,
    "",
    `Endpoint: \`POST ${cfg.baseUrl}/responses/input_tokens\`. Prompt-only baseline: **${base ?? "n/a"}** tokens; "media" = count − baseline.`,
    "",
  ];
  if (warnings.length) lines.push("**Warnings**", "", ...warnings.map((w) => `- ${w}`), "");

  lines.push("## Sources", "", "| Source | File | Size | Pages | Text layer | Bytes |", "|---|---|---|---|---|---|");
  for (const s of sources) {
    const size = s.width ? `${s.width}×${s.height}` : `${s.longEdgeAtFullDpi}px long edge @ ${cfg.pdfDpi} dpi`;
    const text = s.textChars == null ? "" : s.textChars ? `${s.textChars} chars` : "none";
    lines.push(`| ${s.id} | ${s.file} | ${size} | ${s.pages ?? ""} | ${text} | ${fmtBytes(s.bytes)} |`);
  }
  lines.push("");

  const suspicious = [];
  for (const src of ["baseline", ...sources.map((s) => s.id)]) {
    const group = rows.filter((r) => r.source === src);
    if (!group.length) continue;
    lines.push(
      `## ${src}`,
      "",
      "| Variant | Size | Detail | Sent dims | Images | Bytes | Input tokens | Media tokens |",
      "|---|---|---|---|---|---|---|---|",
    );
    for (const r of group) {
      const dims = r.media?.width ? `${r.media.width}×${r.media.height}` : "";
      const tokens = r.inputTokens ?? `error ${r.status}`;
      const delta = r.inputTokens != null && base != null && r.id !== "baseline" ? r.inputTokens - base : "";
      if ((r.media?.images || r.variant === "file") && typeof delta === "number" && delta < SUSPICIOUS_MEDIA_DELTA) {
        suspicious.push(r.id);
      }
      lines.push(
        `| ${r.variant} | ${r.size} | ${r.detail} | ${dims} | ${r.media?.images ?? ""} | ${fmtBytes(r.media?.bytes)} | ${tokens} | ${delta} |`,
      );
    }
    lines.push("");
  }

  if (suspicious.length) {
    lines.push(
      "## ⚠️ Counts that look too low",
      "",
      `These media cases add fewer than ${SUSPICIOUS_MEDIA_DELTA} tokens over the baseline, which matches the bug in meta-models/meta-model-cookbook#58 (the count endpoint not counting media). Check one against \`usage.input_tokens\` from a real \`/v1/responses\` call before trusting them.`,
      "",
      ...suspicious.map((id) => `- \`${id}\``),
      "",
    );
  }
  return lines.join("\n");
}

// ---------------- main ----------------

// --summarize=DIR: rebuild summary.md from a finished run's files; no calls.
if (args.summarize) {
  const dir = String(args.summarize);
  const read = (f) => readFileSync(join(dir, f), "utf8");
  const cfg = existsSync(join(dir, "config.json")) ? JSON.parse(read("config.json")) : CONFIG;
  const saved = existsSync(join(dir, "results.json")) ? JSON.parse(read("results.json")) : {};
  const sources = saved.sources ?? (existsSync(join(dir, "sources.json")) ? JSON.parse(read("sources.json")) : []);
  const rows = existsSync(join(dir, "counts.jsonl"))
    ? read("counts.jsonl")
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => {
          const { request: _req, result: _res, ...row } = JSON.parse(l);
          return row;
        })
    : [];
  if (!rows.length) {
    console.error(`No counts found in ${join(dir, "counts.jsonl")}`);
    process.exit(1);
  }
  writeFileSync(join(dir, "summary.md"), summarize(rows, sources, saved.warnings ?? [], cfg));
  writeFileSync(join(dir, "results.json"), JSON.stringify({ ...saved, rows }, null, 2));
  console.log(`Rebuilt ${join(dir, "summary.md")} from ${rows.length} counts`);
  process.exit(0);
}

// Loaded here so --summarize works without the media dependencies.
const { buildCases } = await import("./cases.mjs");
const { cases, sources, warnings } = await buildCases(CONFIG);
for (const w of warnings) console.warn(`warning: ${w}`);
console.log(`${cases.length} cases from ${sources.length} source(s), model ${CONFIG.model}`);

if (!CONFIG.dryRun && !CONFIG.apiKey) {
  console.error("MODEL_API_KEY is not set (put it in token-count/.env). Use --dry-run to plan without calls.");
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = join(HERE, "results", CONFIG.dryRun ? `${stamp}-dry-run` : stamp);
mkdirSync(outDir, { recursive: true });
const { apiKey: _omit, ...publicConfig } = CONFIG;
writeFileSync(join(outDir, "config.json"), JSON.stringify(publicConfig, null, 2));
writeFileSync(join(outDir, "sources.json"), JSON.stringify(sources, null, 2));
if (CONFIG.saveMedia) mkdirSync(join(outDir, "media"), { recursive: true });

const rows = [];
let interrupted = false;
process.on("SIGINT", () => {
  interrupted = true;
  console.warn("\nInterrupted; writing what's done so far…");
});

for (const [i, c] of cases.entries()) {
  if (interrupted) break;
  const { content, media, files = [] } = await c.build();
  const body = { model: CONFIG.model, input: [{ role: "user", content }] };
  const payloadBytes = Buffer.byteLength(JSON.stringify(body));
  if (CONFIG.saveMedia) for (const f of files) writeFileSync(join(outDir, "media", f.name), f.bytes);

  const label = `[${i + 1}/${cases.length}] ${c.id}`;
  const row = { id: c.id, source: c.source, variant: c.variant, size: c.size, detail: c.detail, media, payloadBytes };
  if (payloadBytes > INLINE_LIMIT) {
    console.warn(`${label}: request is ${fmtBytes(payloadBytes)}, over Muse's 50 MB inline limit`);
  }

  if (CONFIG.dryRun) {
    const dims = media.width ? ` ${media.width}×${media.height}` : "";
    console.log(`${label}${dims} ${fmtBytes(payloadBytes)}`);
    rows.push(row);
    continue;
  }

  const result = await countTokens(body);
  row.status = result.status;
  row.ms = result.ms;
  row.inputTokens = result.response?.input_tokens ?? null;
  rows.push(row);
  appendFileSync(join(outDir, "counts.jsonl"), JSON.stringify({ ...row, request: redact(body), result }) + "\n");
  console.log(`${label}: ${row.inputTokens ?? `HTTP ${result.status} ${JSON.stringify(result.response ?? result.error).slice(0, 200)}`}`);
  await sleep(CONFIG.delayMs);
}

writeFileSync(join(outDir, "results.json"), JSON.stringify({ config: publicConfig, sources, warnings, rows }, null, 2));
if (!CONFIG.dryRun) writeFileSync(join(outDir, "summary.md"), summarize(rows, sources, warnings));
console.log(`\nWrote ${outDir}`);
