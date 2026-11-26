#!/usr/bin/env node
// Builds a visual review page for a limit-test results folder, so you can see
// whether each edit actually looks right, not just whether it passed the checks.
//
// Usage:
//   node review.mjs                       # latest folder in results/
//   node review.mjs results/<timestamp>   # a specific run
//
// Writes <folder>/review.html: for every scored run, Ember's summary or
// question, the code diff vs the original, and before/after renders for each
// example order. Opens in any browser; makes no API calls.

import { Liquid } from "liquidjs";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as F from "./fixtures.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
let dir = process.argv[2];
if (!dir) {
  const root = `${here}results`;
  const runs = existsSync(root) ? readdirSync(root).filter((d) => existsSync(`${root}/${d}/runs.jsonl`)).sort() : [];
  if (!runs.length) {
    console.error("No results folder with runs.jsonl found. Run the limit test first, or pass a folder.");
    process.exit(1);
  }
  dir = `${root}/${runs.at(-1)}`;
}
const records = readFileSync(`${dir}/runs.jsonl`, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

// Same engine settings as the limit test.
const engine = new Liquid({ strictFilters: true, strictVariables: false });

// Placeholder images so asset references are visible in the preview.
const svg = (label, w, h, fill) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" rx="6" fill="${fill}"/><text x="50%" y="55%" font-family="sans-serif" font-size="${Math.round(h / 4)}" fill="#fff" text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`)}`;
const previewAssets = {
  logo: svg("LOGO", 160, 48, "#8a5a44"),
  handmade_badge: svg("HANDMADE", 120, 48, "#3d7a5a"),
  holiday_banner: svg("HOLIDAY", 200, 48, "#a33"),
};

const slipCss = `body{font:13px/1.4 system-ui,sans-serif;margin:12px;color:#222}
table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border-bottom:1px solid #ddd;padding:4px;text-align:left}
h3{font-size:13px;margin:10px 0 4px}header{display:flex;gap:8px;align-items:center}section{margin:6px 0}`;

async function render(template, order) {
  try {
    return await engine.parseAndRender(template, { shop: F.shop, assets: previewAssets, order });
  } catch (e) {
    return `<pre style="color:#b00">Render error: ${esc(e.message)}</pre>`;
  }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Line diff (LCS) for display.
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
  // Show changed lines with 2 lines of context.
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
  const said = a.content ? ` · also said: “${String(a.content).slice(0, 140)}”` : "";
  if (a.error) return `${tools.length ? `called ${tools.join(", ")}` : "replied with text (no tool call)"}: rejected, ${a.error}${said}`;
  if (!tools.length) return `replied with text (no tool call): “${String(a.content ?? "").slice(0, 200)}”`;
  return `called ${tools.join(", ")}: accepted${said}`;
}

const requestText = Object.fromEntries(F.requests.map((r) => [r.id, r.text]));
const orderLabels = { A: "A · typical, under $200", B: "B · gift order", C: "C · big order, over $200" };

// Sandboxed with scripts disabled (any script in a template never runs);
// allow-same-origin only so the page can size each frame to its content.
const frame = (html) => `<iframe sandbox="allow-same-origin" loading="eager" onload="fit(this)" srcdoc="${esc(`<!doctype html><style>${slipCss}</style>${html}`)}"></iframe>`;

const originalRenders = {};
for (const [id, order] of Object.entries(F.orders)) originalRenders[id] = await render(F.classicTemplate, order);

let sections = "";
let idx = 0;
for (const r of records) {
  idx++;
  const last = r.attempts.at(-1) ?? {};
  const call = last.toolCalls?.[0];
  let args = {};
  try { args = call ? JSON.parse(call.arguments) : {}; } catch { /* shown raw below */ }
  const badge = r.outcome === "pass" ? "ok" : r.outcome === "check_fail" ? "warn" : "bad";
  let body = "";

  if (r.finalTemplate) {
    body += `<p class="said">Flint: “${esc(r.summary ?? "")}” <span class="muted">· lines +${r.linesTouched?.added ?? "?"} / −${r.linesTouched?.removed ?? "?"} · valid on attempt ${r.validOnAttempt}</span></p>`;
    const missing = r.itemsMissing ?? r.itemsLost ?? []; // itemsLost: older result files
    const extra = r.itemsExtra ?? [];
    const list = (xs) => esc(xs.slice(0, 4).join(" · ")) + (xs.length > 4 ? " …" : "");
    if (missing.length) body += `<p class="warn-note">⚠️ ${missing.length} item${missing.length > 1 ? "s" : ""} missing: ${list(missing)}</p>`;
    if (extra.length) body += `<p class="warn-note">⚠️ Extra items: ${list(extra)}</p>`;
    body += `<details open><summary>Code diff vs original</summary><pre class="diff">${diff(F.classicTemplate, r.finalTemplate)}</pre></details>`;
    body += `<div class="grid"><div class="h">Order</div><div class="h">Before (original)</div><div class="h">After (Ember's edit)</div>`;
    for (const [id, order] of Object.entries(F.orders)) {
      body += `<div class="lbl">${orderLabels[id]}</div>${frame(originalRenders[id])}${frame(await render(r.finalTemplate, order))}`;
    }
    body += `</div>`;
  } else if (call) {
    body += `<p class="said">Ember called <code>${esc(call.name)}</code>:</p><pre class="args">${esc(JSON.stringify(args, null, 2) || call.arguments)}</pre>`;
  } else if (last.content) {
    body += `<p class="said">Ember replied in plain text:</p><pre class="args">${esc(last.content)}</pre>`;
  }
  if (r.attempts.length > 1 || last.error) {
    body += `<details><summary>${r.attempts.length} attempts</summary>${r.attempts.map((a, k) => `<p class="muted">Attempt ${k + 1}: ${esc(attemptLabel(a))}</p>`).join("")}</details>`;
  }

  sections += `<section class="run" id="r${idx}">
  <h2><span class="badge ${badge}">${esc(r.outcome)}</span> ${esc(r.request)} <span class="muted">· ${esc(r.api)} / ${esc(r.mode)} / ${esc(r.effort)} · run ${r.run}</span></h2>
  <p class="req">“${esc(requestText[r.request] ?? "")}”</p>
  ${r.detail && r.finalTemplate ? `<p class="muted">Automatic check: ${esc(r.detail)}</p>` : ""}
  ${r.detail && !r.finalTemplate && r.outcome !== "pass" ? `<p class="muted">${esc(r.detail)}</p>` : ""}
  ${body}
</section>`;
}

const counts = records.reduce((m, r) => ((m[r.outcome] = (m[r.outcome] ?? 0) + 1), m), {});
const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Limit Test Review</title>
<style>
:root{--bg:#f6f5f2;--card:#fff;--ink:#1d1d1f;--muted:#6b6b70;--line:#e3e1dc;--add:#e6f4ea;--del:#fde8e8;--ok:#1e7a46;--warn:#a86400;--bad:#b42318}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#18181a;--card:#222225;--ink:#ececee;--muted:#9a9aa2;--line:#38383d;--add:#1d3a28;--del:#432222}}
:root[data-theme="dark"]{--bg:#18181a;--card:#222225;--ink:#ececee;--muted:#9a9aa2;--line:#38383d;--add:#1d3a28;--del:#432222}
body{margin:0;padding:16px;background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,sans-serif}
.wrap{max-width:1200px;margin:0 auto}h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:0 0 6px}
.run{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;margin:14px 0}
.muted{color:var(--muted);font-weight:400}.req{font-style:italic;margin:0 0 6px}.said{margin:8px 0}
.badge{font-size:12px;padding:2px 8px;border-radius:99px;color:#fff;vertical-align:2px}.ok{background:var(--ok)}.warn{background:var(--warn)}.bad{background:var(--bad)}
pre{overflow-x:auto;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:8px;font-size:12px;margin:6px 0}
.diff div{white-space:pre}.add{background:var(--add)}.del{background:var(--del)}.gap{color:var(--muted)}
.grid{display:grid;grid-template-columns:150px 1fr 1fr;gap:8px;margin-top:10px;align-items:start}
.h{font-weight:600;font-size:12px;color:var(--muted)}.lbl{font-size:12px;color:var(--muted);padding-top:6px}
iframe{width:100%;height:420px;border:1px solid var(--line);border-radius:6px;background:#fff}
summary{cursor:pointer;color:var(--muted)}
.warn-note{border-left:3px solid var(--warn);padding:4px 10px;margin:8px 0;background:var(--bg)}
@media (max-width:760px){.grid{grid-template-columns:1fr}.h:first-child,.lbl{padding-top:10px}}
</style>
<script>
function fit(f){try{f.style.height=(f.contentDocument.documentElement.scrollHeight+4)+"px"}catch(e){}}
addEventListener("resize",()=>document.querySelectorAll("iframe").forEach(fit));
</script></head><body><div class="wrap">
<h1>Limit test review</h1>
<p class="muted">${esc(dir)} · ${records.length} runs · ${Object.entries(counts).map(([k, v]) => `${esc(k)}: ${v}`).join(" · ")}</p>
<p class="muted">Placeholder boxes stand in for the logo and badge images.</p>
${sections}
</div></body></html>`;

writeFileSync(`${dir}/review.html`, page);
console.log(`Wrote ${dir}/review.html (${records.length} runs). Open it in your browser.`);
