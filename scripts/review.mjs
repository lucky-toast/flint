#!/usr/bin/env node
// Builds a visual review page for a logs/ folder written by `npm start`, like the limit test's
// review.mjs: for every turn, the request, what Flint did, the code diff against the template the
// turn started from, and before/after renders for every example order of the shop.
//
// Usage:
//   npm run review                 # latest folder in logs/
//   npm run review -- logs/<time>  # a specific folder
//
// Writes <folder>/review.html. Makes no API calls.

import { build } from "esbuild";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
let dir = process.argv[2];
if (!dir) {
  const logs = `${root}logs`;
  const runs = existsSync(logs) ? readdirSync(logs).filter((d) => existsSync(`${logs}/${d}/runs.jsonl`)).sort() : [];
  if (!runs.length) {
    console.error("No logs folder with runs.jsonl found. Run `npm start` and send Flint a request first, or pass a folder.");
    process.exit(1);
  }
  dir = `${logs}/${runs.at(-1)}`;
}
const records = readFileSync(`${dir}/runs.jsonl`, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

// Flint's own rendering and item counter, bundled from src/ so the review matches the app.
const lib = `${dir}/.review-lib.mjs`;
await build({
  stdin: {
    contents: `export { renderSlip, previewDocument, compareItems, whatChanged, missingItemsWarning, extraItemsWarning, withUploadedAssets } from "./src/core";
export { shops } from "./src/data";`,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: lib,
  // Bundled CommonJS dependencies (LiquidJS) still require Node built-ins.
  banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
  logLevel: "error",
});
const F = await import(pathToFileURL(lib).href);
rmSync(lib);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Line diff (LCS) for display, with 2 lines of context around changes.
function diff(a, b) {
  const A = a.split("\n"), B = b.split("\n");
  const n = A.length, m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push([" ", A[i]]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) out.push(["-", A[i++]]);
    else out.push(["+", B[j++]]);
  }
  while (i < n) out.push(["-", A[i++]]);
  while (j < m) out.push(["+", B[j++]]);
  const keep = new Set();
  out.forEach(([t], k) => { if (t !== " ") for (let d = -2; d <= 2; d++) keep.add(k + d); });
  let html = "", gap = false;
  out.forEach(([t, line], k) => {
    if (!keep.has(k)) { if (!gap) html += `<div class="gap">⋯</div>`; gap = true; return; }
    gap = false;
    html += `<div class="${t === "+" ? "add" : t === "-" ? "del" : "ctx"}">${t} ${esc(line)}</div>`;
  });
  return html || `<div class="ctx">(no changes)</div>`;
}

// What happened on one attempt, in plain words.
function attemptLabel(a) {
  const tools = (a.toolCalls ?? []).map((c) => c.name);
  const usage = a.usage ? ` · ${a.usage.prompt} in (${a.usage.cached} cached) / ${a.usage.completion} out · ${a.latencyMs} ms` : "";
  const said = a.content ? ` · also said: “${String(a.content).slice(0, 140)}”` : "";
  if (a.error) return `failed: ${a.error}${usage}`;
  if (a.finish === "incomplete") return `truncated (output cap)${usage}`;
  if (!tools.length) return `replied with text (no tool call): “${String(a.content ?? "").slice(0, 200)}”${usage}`;
  return `called ${tools.join(", ")}${usage}${said}`;
}

// The slip document as the app shows it (same CSP); scripts stay disabled by the sandbox.
const frame = (html) =>
  `<iframe sandbox="allow-same-origin" loading="eager" onload="fit(this)" srcdoc="${esc(F.previewDocument(html, "letter"))}"></iframe>`;

async function render(source, shop, order) {
  try {
    return await F.renderSlip(source, shop, order);
  } catch (e) {
    return `<pre style="color:#b00">Render error: ${esc(e.message)}</pre>`;
  }
}

const badgeFor = { edit: "ok", ask: "warn", asset: "warn", reply: "warn" };

let sections = "";
let idx = 0;
for (const r of records) {
  idx++;
  const baseShop = F.shops.find((s) => s.id === r.shopId);
  // Uploaded images stay in the browser; placeholders stand in for them here.
  const shop = baseShop && F.withUploadedAssets(baseShop, r.uploadedAssets);
  let body = "";

  if (r.finalTemplate && shop) {
    body += `<p class="said">Flint: “${esc(r.summary ?? "")}” <span class="muted">· lines +${r.linesTouched?.added ?? "?"} / −${r.linesTouched?.removed ?? "?"}${r.validOnAttempt ? ` · valid on attempt ${r.validOnAttempt}` : ""}</span></p>`;
    const changes = await F.compareItems(r.startTemplate, r.finalTemplate, shop);
    const notes = [F.whatChanged(changes), F.missingItemsWarning(changes), F.extraItemsWarning(changes)].filter(Boolean);
    for (const note of notes) body += `<p class="${note.startsWith("⚠️") ? "warn-note" : "muted"}">${esc(note)}</p>`;
    body += `<details open><summary>Code diff vs the template before this turn</summary><pre class="diff">${diff(r.startTemplate, r.finalTemplate)}</pre></details>`;
    body += `<div class="grid"><div class="h">Order</div><div class="h">Before this turn</div><div class="h">After (Flint's edit)</div>`;
    for (const order of shop.orders) {
      body += `<div class="lbl">#${esc(order.number)} · ${esc(order.label)}</div>${frame(await render(r.startTemplate, shop, order))}${frame(await render(r.finalTemplate, shop, order))}`;
    }
    body += `</div>`;
  } else if (r.outcome === "ask") {
    body += `<p class="said">Flint asked: “${esc(r.question)}”</p>${r.options?.length ? `<p class="muted">Chips: ${r.options.map(esc).join(" · ")}</p>` : ""}`;
  } else if (r.outcome === "asset") {
    body += `<p class="said">Flint asked for an image: “${esc(r.description)}”</p>`;
  } else if (r.outcome === "reply") {
    body += `<p class="said">Flint replied: “${esc(r.message)}”</p>`;
  } else {
    body += `<p class="said">No change: ${esc(r.outcome)}.</p>`;
  }
  if (r.attempts.length) {
    body += `<details ${r.attempts.length > 1 ? "open" : ""}><summary>${r.attempts.length} attempt${r.attempts.length > 1 ? "s" : ""}</summary>${r.attempts
      .map((a, k) => `<p class="muted">Attempt ${k + 1}: ${esc(attemptLabel(a))}</p>`)
      .join("")}</details>`;
  }
  const context = [r.shopId, r.mode, r.detail, `turn ${r.turn}`, r.historyTurns ? `${r.historyTurns} earlier turns` : "", r.retryHint ? "try again" : ""]
    .filter(Boolean)
    .map(esc)
    .join(" · ");

  sections += `<section class="run" id="r${idx}">
  <h2><span class="badge ${badgeFor[r.outcome] ?? "bad"}">${esc(r.outcome)}</span> “${esc(r.request)}” <span class="muted">· ${context}</span></h2>
  ${r.retryHint ? `<p class="muted">Try again, after: “${esc(r.retryHint)}”</p>` : ""}
  ${body}
</section>`;
}

const counts = records.reduce((m, r) => ((m[r.outcome] = (m[r.outcome] ?? 0) + 1), m), {});
const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Flint turn review</title>
<style>
:root{--bg:#f6f5f2;--card:#fff;--ink:#1d1d1f;--muted:#6b6b70;--line:#e3e1dc;--add:#e6f4ea;--del:#fde8e8;--ok:#1e7a46;--warn:#a86400;--bad:#b42318}
@media (prefers-color-scheme: dark){:root{--bg:#18181a;--card:#222225;--ink:#ececee;--muted:#9a9aa2;--line:#38383d;--add:#1d3a28;--del:#432222}}
body{margin:0;padding:16px;background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,sans-serif}
.wrap{max-width:1200px;margin:0 auto}h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:0 0 6px}
.run{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;margin:14px 0}
.muted{color:var(--muted);font-weight:400}.said{margin:8px 0}
.badge{font-size:12px;padding:2px 8px;border-radius:99px;color:#fff;vertical-align:2px}.ok{background:var(--ok)}.warn{background:var(--warn)}.bad{background:var(--bad)}
pre{overflow-x:auto;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:8px;font-size:12px;margin:6px 0}
.diff div{white-space:pre}.add{background:var(--add)}.del{background:var(--del)}.gap{color:var(--muted)}
.grid{display:grid;grid-template-columns:150px 1fr 1fr;gap:8px;margin-top:10px;align-items:start}
.h{font-weight:600;font-size:12px;color:var(--muted)}.lbl{font-size:12px;color:var(--muted);padding-top:6px}
iframe{width:100%;height:420px;border:1px solid var(--line);border-radius:6px;background:#fff}
summary{cursor:pointer;color:var(--muted)}
.warn-note{border-left:3px solid var(--warn);padding:4px 10px;margin:8px 0;background:var(--bg)}
@media (max-width:760px){.grid{grid-template-columns:1fr}}
</style>
<script>
function fit(f){try{f.style.height=(f.contentDocument.documentElement.scrollHeight+4)+"px"}catch(e){}}
addEventListener("resize",()=>document.querySelectorAll("iframe").forEach(fit));
</script></head><body><div class="wrap">
<h1>Flint turn review</h1>
<p class="muted">${esc(dir)} · ${records.length} turns · ${Object.entries(counts).map(([k, v]) => `${esc(k)}: ${v}`).join(" · ")}</p>
<p class="muted">Raw Ember requests and responses are in calls.jsonl. Placeholder boxes stand in for uploaded images.</p>
${sections}
</div></body></html>`;

writeFileSync(`${dir}/review.html`, page);
console.log(`Wrote ${dir}/review.html (${records.length} turns). Open it in your browser.`);
