#!/usr/bin/env node
// "Make it look like this": runs Flint's real first turn against Muse Ember with a
// design attached, to see what Ember does with it and what it actually costs.
//
// Every run starts from the app's defaults: the Kiln & Co. shop and the Classic template.
// The request is exactly what the app sends today (app-snapshot.mjs), except that the user
// message gets the design attached after its text:
//   instructions  buildInstructions(Kiln & Co.)
//   tools         edit_template, ask_clarification, request_asset, reply
//   input         [{ role: "user", content: [ input_text(template + "Request: <message>"), <attachment> ] }]
// Attachments follow the upload rule: PDFs go as the file (input_file); images are shrunk
// to at most --max-pixels (keeping their shape, never enlarged) and sent as input_image.
//
// Each run mirrors the app's turn loop (src/core/turn.ts): up to 3 calls. A rejected edit,
// bad tool arguments or text with no tool call go back to Ember as the app would send them.
// Whatever comes back first (edit, ask, asset, reply) is the run's outcome; questions are not
// answered.
//
// API key: MODEL_API_KEY in token-count/.env (gitignored; copy .env.example).
//
// Usage:
//   node turn-run.mjs --dry-run           build and save each input's request; no calls
//   node turn-run.mjs --runs=1            a first look: 4 runs (1 per input)
//   node turn-run.mjs --runs=10           the full batch: 40 runs
//
// Options (defaults in brackets):
//   --runs=N            runs per input [1]
//   --only=ids          inputs to include: pdf-text,pdf-flat,design,sketch [all]
//   --message=TEXT      what the seller types ["make it look like this"]
//   --max-pixels=N      image limit, in pixels [1800000]
//   --max-calls=N       hard cap on API calls, HTTP retries included [200]
//   --max-cost-usd=N    stop once actual spend reaches this [1.00]
//   --http-retries=N    retries on 429 / 5xx / network errors, per call [3]
//   --timeout-s=N       per-call HTTP timeout [300]
//   --inputs=DIR        [./inputs]
//
// Output (results/turns-<timestamp>/), written as the run goes:
//   run.log             every line printed to the console
//   config.json         the settings used (no API key)
//   inputs.json         each input as sent: file, dimensions, bytes, attachment type
//   media/              each attachment exactly as sent
//   calls/<input>/run-NN/attempt-N.request.json    the full request body, attachment included
//   calls/<input>/run-NN/attempt-N.response.json   HTTP status, headers, raw body (parsed if JSON)
//   calls.jsonl         one line per HTTP call: ids, status, latency, usage (body omitted)
//   runs.jsonl          one line per run: outcome, tool arguments, edited template, usage totals
//   summary.html + summary.md   built at the end by turn-summary.mjs (rerun it any time)

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";
import { Liquid } from "liquidjs";
import {
  EMBER_MODEL,
  LIQUID_OPTIONS,
  MAX_ATTEMPTS,
  PLACEHOLDER_IMAGE,
  SHOP,
  TEMPLATE_NAME,
  TEMPLATE_SOURCE,
  TEXT_ON_RETRY_NUDGE,
  TOOLS,
  applyEdits,
  buildInstructions,
  buildUserMessage,
  costUsd,
  editRejection,
  renderContext,
  requestBody,
  toolRejection,
} from "./app-snapshot.mjs";
import { SOURCES } from "./cases.mjs";
import { dataUrl, fitToPixels, imageInfo } from "./media.mjs";
import { buildSummary } from "./turn-summary.mjs";

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
const list = (v) => String(v).split(",").map((s) => s.trim()).filter(Boolean);

const CONFIG = {
  baseUrl: (process.env.MODEL_API_BASE_URL ?? "https://api.meta.ai/v1").replace(/\/+$/, ""),
  apiKey: process.env.MODEL_API_KEY,
  model: EMBER_MODEL,
  shop: SHOP.id,
  template: TEMPLATE_NAME,
  runs: int(args.runs, 1),
  only: args.only ? list(args.only) : null,
  message: args.message ?? "make it look like this",
  maxPixels: int(args["max-pixels"], 1_800_000),
  maxCalls: int(args["max-calls"], 200),
  maxCostUsd: Number(args["max-cost-usd"] ?? 1),
  httpRetries: int(args["http-retries"], 3),
  timeoutMs: int(args["timeout-s"], 300) * 1000,
  inputsDir: args.inputs ? String(args.inputs) : join(HERE, "inputs"),
  dryRun: Boolean(args["dry-run"]),
};

if (!CONFIG.dryRun && !CONFIG.apiKey) {
  console.error("MODEL_API_KEY is not set (put it in token-count/.env). Use --dry-run to build requests without calls.");
  process.exit(1);
}

// ---------------- output + logging ----------------
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = join(HERE, "results", `turns-${stamp}${CONFIG.dryRun ? "-dry-run" : ""}`);
mkdirSync(join(OUT, "media"), { recursive: true });
const LOG = join(OUT, "run.log");

/** Prints a line and appends it to run.log, so the log has every line the console showed. */
function log(...parts) {
  const line = parts.map((p) => (typeof p === "string" ? p : inspect(p, { depth: 6, breakLength: 120 }))).join(" ");
  console.log(line);
  appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`);
}
const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2));
const appendJsonl = (file, value) => appendFileSync(join(OUT, file), JSON.stringify(value) + "\n");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { apiKey: _omit, ...publicConfig } = CONFIG;
writeJson(join(OUT, "config.json"), { ...publicConfig, startedAt: new Date().toISOString() });
log(`Output: ${OUT}`);
log(`Model ${CONFIG.model}, shop ${SHOP.name}, template ${TEMPLATE_NAME}, message "${CONFIG.message}"`);

// ---------------- validation (src/core/validate.ts) ----------------
const liquid = new Liquid(LIQUID_OPTIONS);
const placeholderAssets = Object.fromEntries(Object.keys(SHOP.assets).map((n) => [n, PLACEHOLDER_IMAGE]));

async function validateTemplate(source) {
  try {
    const parsed = liquid.parse(source);
    for (const order of SHOP.orders) {
      try {
        await liquid.render(parsed, renderContext(SHOP, order, placeholderAssets));
      } catch (err) {
        return { ok: false, error: `${err instanceof Error ? err.message : String(err)} (rendering order #${order.number})` };
      }
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  return { ok: true };
}

// ---------------- attachments ----------------
async function prepareInputs() {
  const prepared = [];
  for (const src of SOURCES) {
    if (CONFIG.only && !CONFIG.only.includes(src.id)) continue;
    const file = src.files.map((f) => join(CONFIG.inputsDir, f)).find(existsSync);
    if (!file) {
      log(`warning: ${src.id}: no input found (looked for ${src.files.join(", ")} in ${CONFIG.inputsDir}); skipped`);
      continue;
    }
    const buf = readFileSync(file);
    if (src.kind === "pdf") {
      const name = basename(file);
      writeFileSync(join(OUT, "media", `${src.id}.pdf`), buf);
      prepared.push({
        id: src.id,
        file: name,
        sent: { type: "input_file", bytes: buf.length, mediaFile: `media/${src.id}.pdf` },
        part: { type: "input_file", filename: name, file_data: dataUrl("application/pdf", buf) },
      });
    } else {
      const info = await imageInfo(buf);
      const img = await fitToPixels(buf, info, CONFIG.maxPixels);
      const ext = img.mime === "image/png" ? "png" : "jpg";
      writeFileSync(join(OUT, "media", `${src.id}.${ext}`), img.bytes);
      prepared.push({
        id: src.id,
        file: basename(file),
        original: { width: info.width, height: info.height, bytes: buf.length },
        sent: {
          type: "input_image",
          width: img.width,
          height: img.height,
          pixels: img.width * img.height,
          bytes: img.bytes.length,
          mime: img.mime,
          resized: img.bytes !== buf,
          mediaFile: `media/${src.id}.${ext}`,
        },
        part: { type: "input_image", image_url: dataUrl(img.mime, img.bytes) },
      });
    }
  }
  writeJson(
    join(OUT, "inputs.json"),
    prepared.map(({ part: _p, ...rest }) => rest),
  );
  for (const p of prepared) log(`input ${p.id}: ${p.file} -> ${JSON.stringify(p.sent)}`);
  return prepared;
}

// ---------------- the API call ----------------
let callCount = 0;
let spentUsd = 0;

class BudgetStop extends Error {}

/** One logical call to /responses, with HTTP retries. Every HTTP attempt is logged in full. */
async function respond(body, ctx) {
  const dir = join(OUT, "calls", ctx.input, `run-${String(ctx.run).padStart(2, "0")}`);
  mkdirSync(dir, { recursive: true });
  const bodyText = JSON.stringify(body);
  for (let retry = 0; retry <= CONFIG.httpRetries; retry++) {
    if (callCount >= CONFIG.maxCalls) throw new BudgetStop(`--max-calls=${CONFIG.maxCalls} reached`);
    if (spentUsd >= CONFIG.maxCostUsd) throw new BudgetStop(`--max-cost-usd=${CONFIG.maxCostUsd} reached ($${spentUsd.toFixed(4)})`);
    callCount++;
    const tag = `attempt-${ctx.attempt}${retry ? `.retry-${retry}` : ""}`;
    writeFileSync(join(dir, `${tag}.request.json`), bodyText);
    const started = Date.now();
    let record;
    try {
      const res = await fetch(`${CONFIG.baseUrl}/responses`, {
        method: "POST",
        headers: { authorization: `Bearer ${CONFIG.apiKey}`, "content-type": "application/json" },
        body: bodyText,
        signal: AbortSignal.timeout(CONFIG.timeoutMs),
      });
      const raw = await res.text();
      let json = null;
      try {
        json = JSON.parse(raw);
      } catch {}
      record = { status: res.status, ms: Date.now() - started, headers: Object.fromEntries(res.headers), body: json ?? raw };
    } catch (err) {
      record = { status: 0, ms: Date.now() - started, error: String(err) };
    }
    writeJson(join(dir, `${tag}.response.json`), record);

    const u = record.body?.usage ?? {};
    const usage = {
      input_tokens: u.input_tokens ?? 0,
      cached: u.input_tokens_details?.cached_tokens ?? 0,
      output_tokens: u.output_tokens ?? 0,
      reasoning: u.output_tokens_details?.reasoning_tokens ?? 0,
    };
    const cost = costUsd(usage);
    spentUsd += cost;
    appendJsonl("calls.jsonl", {
      ...ctx,
      retry,
      file: join("calls", ctx.input, `run-${String(ctx.run).padStart(2, "0")}`, tag),
      status: record.status,
      ms: record.ms,
      requestBytes: Buffer.byteLength(bodyText),
      responseStatus: record.body?.status,
      usage,
      rawUsage: record.body?.usage ?? null,
      costUsd: cost,
      error: record.error ?? (record.status >= 400 ? record.body : undefined),
    });
    log(
      `  ${ctx.input} run ${ctx.run} attempt ${ctx.attempt}${retry ? ` retry ${retry}` : ""}: HTTP ${record.status} in ${record.ms} ms,` +
        ` in ${usage.input_tokens} (cached ${usage.cached}) out ${usage.output_tokens} (reasoning ${usage.reasoning}), $${cost.toFixed(6)}`,
    );

    if (record.status >= 200 && record.status < 300 && record.body && typeof record.body === "object") {
      return { response: record.body, usage, cost, ms: record.ms };
    }
    const retryable = record.status === 0 || record.status === 429 || record.status >= 500;
    if (!retryable || retry === CONFIG.httpRetries) {
      const err = new Error(`HTTP ${record.status}: ${JSON.stringify(record.body ?? record.error).slice(0, 500)}`);
      err.httpStatus = record.status;
      throw err;
    }
    const after = Number(record.headers?.["retry-after"]);
    await sleep(Number.isFinite(after) && after > 0 ? after * 1000 : 2000 * 2 ** retry);
  }
}

// ---------------- the turn (src/core/turn.ts) ----------------
function replayItems(output) {
  const items = [];
  for (const item of output) {
    if (item.type === "reasoning" && item.encrypted_content) {
      items.push({ type: "reasoning", id: item.id, summary: item.summary ?? [], encrypted_content: item.encrypted_content });
    } else if (item.type === "message") {
      const text = messageText([item]);
      if (text) items.push({ role: "assistant", content: [{ type: "output_text", text }] });
    } else if (item.type === "function_call") {
      items.push({ type: "function_call", call_id: item.call_id, name: item.name, arguments: item.arguments });
    }
  }
  return items;
}

function messageText(output) {
  return output
    .filter((i) => i.type === "message")
    .flatMap((m) => m.content ?? [])
    .filter((c) => c.type === "output_text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("");
}

function parseArguments(call) {
  try {
    const a = JSON.parse(call.arguments);
    return a && typeof a === "object" && !Array.isArray(a) ? a : undefined;
  } catch {
    return undefined;
  }
}

const isString = (v) => typeof v === "string";
const isEdit = (v) => !!v && typeof v === "object" && isString(v.find) && isString(v.replace);

async function handleCall(call) {
  const a = parseArguments(call);
  if (!a) {
    const error = "the arguments are not a valid JSON object";
    return { feedback: call.name === "edit_template" ? editRejection(error) : toolRejection(call.name, error) };
  }
  switch (call.name) {
    case "edit_template": {
      if (!Array.isArray(a.edits) || !a.edits.every(isEdit) || !isString(a.summary)) {
        return { feedback: editRejection("the arguments must be { edits: { find: string, replace: string }[], summary: string }") };
      }
      const applied = applyEdits(TEMPLATE_SOURCE, a.edits);
      if (!applied.ok) return { feedback: editRejection(applied.error) };
      const valid = await validateTemplate(applied.source);
      if (!valid.ok) return { feedback: editRejection(valid.error) };
      return { result: { type: "edit", summary: a.summary, edits: a.edits, templateSource: applied.source } };
    }
    case "ask_clarification": {
      if (!isString(a.question)) return { feedback: toolRejection(call.name, "`question` must be a string") };
      const offered = Array.isArray(a.options) ? a.options.filter(isString).slice(0, 4) : [];
      return { result: { type: "ask", question: a.question, options: offered.length >= 2 ? offered : [] } };
    }
    case "request_asset":
      if (!isString(a.description)) return { feedback: toolRejection(call.name, "`description` must be a string") };
      return { result: { type: "asset", description: a.description } };
    case "reply":
      if (!isString(a.message)) return { feedback: toolRejection(call.name, "`message` must be a string") };
      return { result: { type: "reply", message: a.message } };
    default:
      return { feedback: `Unknown tool ${call.name}. The template is unchanged. Call one of: ${TOOLS.map((t) => t.name).join(", ")}.` };
  }
}

async function runTurn(input, run, instructions) {
  const items = [
    {
      role: "user",
      content: [
        { type: "input_text", text: buildUserMessage({ templateSource: TEMPLATE_SOURCE, message: CONFIG.message }) },
        input.part,
      ],
    },
  ];
  const calls = [];
  const rejections = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { response, usage, cost, ms } = await respond(requestBody({ instructions, input: items, tools: TOOLS }), {
      input: input.id,
      run,
      attempt,
    });
    calls.push({ attempt, usage, cost, ms });
    const output = Array.isArray(response.output) ? response.output : [];
    for (const o of output) {
      if (o.type === "function_call") log(`    tool ${o.name}: ${o.arguments}`);
      else if (o.type === "message") log(`    text: ${messageText([o])}`);
      else log(`    ${o.type}${o.summary?.length ? `: ${JSON.stringify(o.summary)}` : ""}`);
    }
    if (response.status === "incomplete") return { result: { type: "error", error: "too_big", detail: response.incomplete_details }, calls, rejections };

    const call = output.find((o) => o.type === "function_call");
    if (!call) {
      const text = messageText(output).trim();
      if (attempt === 1 && text) return { result: { type: "reply", message: text, viaText: true }, calls, rejections };
      rejections.push({ attempt, feedback: TEXT_ON_RETRY_NUDGE });
      items.push(...replayItems(output), { role: "user", content: TEXT_ON_RETRY_NUDGE });
      continue;
    }
    const outcome = await handleCall(call);
    if (outcome.result) return { result: { ...outcome.result, tool: call.name, arguments: call.arguments }, calls, rejections };
    log(`    rejected: ${outcome.feedback}`);
    rejections.push({ attempt, tool: call.name, arguments: call.arguments, feedback: outcome.feedback });
    items.push(...replayItems(output), { type: "function_call_output", call_id: call.call_id, output: outcome.feedback });
  }
  return { result: { type: "error", error: "invalid" }, calls, rejections };
}

// ---------------- main ----------------
const inputs = await prepareInputs();
const instructions = buildInstructions(SHOP);

if (CONFIG.dryRun) {
  for (const input of inputs) {
    const body = requestBody({
      instructions,
      tools: TOOLS,
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: buildUserMessage({ templateSource: TEMPLATE_SOURCE, message: CONFIG.message }) }, input.part],
        },
      ],
    });
    writeFileSync(join(OUT, `request-${input.id}.json`), JSON.stringify(body, null, 2));
    log(`dry run: wrote request-${input.id}.json (${Buffer.byteLength(JSON.stringify(body))} bytes)`);
  }
  log(`Would make ${inputs.length * CONFIG.runs} runs (${CONFIG.runs} per input), up to ${inputs.length * CONFIG.runs * MAX_ATTEMPTS} calls.`);
  process.exit(0);
}

let stopped = null;
let interrupted = false;
process.on("SIGINT", () => {
  interrupted = true;
  log("Interrupted; finishing the current call, then writing the summary…");
});

outer: for (let run = 1; run <= CONFIG.runs; run++) {
  for (const input of inputs) {
    if (interrupted) break outer;
    log(`${input.id} run ${run}/${CONFIG.runs}`);
    const started = Date.now();
    let turn;
    try {
      turn = await runTurn(input, run, instructions);
    } catch (err) {
      if (err instanceof BudgetStop) {
        stopped = err.message;
        log(`Stopping: ${err.message}`);
        break outer;
      }
      turn = { result: { type: "error", error: "http", detail: String(err.message ?? err) }, calls: [], rejections: [] };
    }
    const totals = turn.calls.reduce(
      (t, c) => ({
        input_tokens: t.input_tokens + c.usage.input_tokens,
        cached: t.cached + c.usage.cached,
        output_tokens: t.output_tokens + c.usage.output_tokens,
        reasoning: t.reasoning + c.usage.reasoning,
        costUsd: t.costUsd + c.cost,
      }),
      { input_tokens: 0, cached: 0, output_tokens: 0, reasoning: 0, costUsd: 0 },
    );
    const record = { input: input.id, run, ...turn, totals, ms: Date.now() - started };
    appendJsonl("runs.jsonl", record);
    if (turn.result.type === "edit") writeFileSync(join(OUT, `${input.id}-run-${String(run).padStart(2, "0")}.liquid`), turn.result.templateSource);
    const r = turn.result;
    const what = r.summary ?? r.question ?? r.message ?? r.description ?? r.detail ?? r.error ?? "";
    log(`  => ${r.type}: ${what} (${turn.calls.length} call(s), $${totals.costUsd.toFixed(6)})`);
  }
}

writeJson(join(OUT, "config.json"), {
  ...publicConfig,
  finishedAt: new Date().toISOString(),
  calls: callCount,
  spentUsd,
  stopped,
  interrupted,
});
log(`Done: ${callCount} call(s), $${spentUsd.toFixed(6)} spent${stopped ? ` (stopped: ${stopped})` : ""}.`);
const { html, md } = await buildSummary(OUT);
log(`Summary: ${html}`);
log(`         ${md}`);
