#!/usr/bin/env node
// Builds a visual review page for a tweak-test results folder, so every automatic check can be
// confirmed by eye: per sequence, the shared first request, then each variant's tweaks with
// Flint's summary, the check result, every attempt (with rejections and tokens), the code diff
// against the step before, and the final slip beside the base for every example order.
//
// Usage:
//   node tweak-test/review.mjs                       # latest folder in tweak-test/results/
//   node tweak-test/review.mjs tweak-test/results/<timestamp>
//
// Writes <folder>/review.html. Makes no API calls.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HERE, loadFlint } from "./lib.mjs";
import { SEQUENCES } from "./sequences.mjs";

let dir = process.argv[2];
if (!dir) {
  const root = join(HERE, "results");
  const runs = existsSync(root) ? readdirSync(root).filter((d) => existsSync(join(root, d, "steps.jsonl"))).sort() : [];
  if (!runs.length) {
    console.error("No results folder with steps.jsonl found. Run the tweak test first, or pass a folder.");
    process.exit(1);
  }
  dir = join(root, runs.at(-1));
}
const records = readFileSync(join(dir, "steps.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

const F = await loadFlint();
const SHOP = F.shops.find((s) => s.id === "kiln-and-co");
const TEMPLATES = Object.fromEntries(F.builtInTemplates.map((t) => [t.id, t]));

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Line diff (LCS), with 2 lines of context around changes.
function diff(a, b) {
  const A = a.split("\n"), B = b.split("\n");
  const n = A.length, m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
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

async function render(source, order) {
  try {
    return await F.renderSlip(source, SHOP, order);
  } catch (e) {
    return `<pre style="color:#b00">Render error: ${esc(e.message)}</pre>`;
  }
}
const frame = (html, paper) => `<iframe sandbox="allow-same-origin" loading="lazy" onload="fit(this)" srcdoc="${esc(F.previewDocument(html, paper))}"></iframe>`;

function attemptLine(a, k) {
  const u = a.usage;
  const tok = `${u.input.toLocaleString()} in (${u.cached.toLocaleString()} cached) · ${u.output.toLocaleString()} out · ${a.latencyMs} ms`;
  const what = a.toolCall ? `called ${a.toolCall.name}` : a.text ? `replied “${esc(a.text.slice(0, 160))}”` : "no output";
  const rej = a.rejection ? ` → <strong>rejected (${esc(a.rejection.kind)})</strong>: ${esc(a.rejection.error)}` : "";
  return `<li>Attempt ${k + 1}: ${what}${rej} <span class="muted">· ${tok}${a.prefixOk ? "" : " · <strong>prefix broken</strong>"}</span></li>`;
}

function badge(r) {
  if (r.outcome === "edit") return r.check?.ok ? `<span class="badge ok">pass</span>` : `<span class="badge warn">check fail</span>`;
  return `<span class="badge ${["ask", "asset", "reply"].includes(r.outcome) ? "warn" : "bad"}">${esc(r.outcome)}</span>`;
}

function stepBlock(r, prevSource) {
  let h = `<div class="step"><h4>${badge(r)} Step ${r.step}${r.finds !== "first" ? ` <span class="muted">· edit lands in ${r.finds === "own" ? "Ember's own code" : "the original template"}</span>` : ""}</h4>`;
  h += `<p class="req">“${esc(r.request)}”</p>`;
  if (r.summary) h += `<p>Flint: “${esc(r.summary)}”</p>`;
  else if (r.detail) h += `<p>${esc(r.detail)}</p>`;
  if (r.check) h += `<p class="muted">Check: ${esc(r.check.detail)}</p>`;
  h += `<p class="muted">${r.attempts.length} attempt(s) · ${r.rejections} rejected (${r.findRejections} find) · ${r.usage.input.toLocaleString()} input tokens, ${r.usage.uncached.toLocaleString()} uncached · $${r.usage.costUsd.toFixed(5)}</p>`;
  h += `<details${r.rejections ? " open" : ""}><summary>Attempts</summary><ul>${r.attempts.map(attemptLine).join("")}</ul></details>`;
  if (r.source) h += `<details><summary>Code diff vs the step before</summary><pre class="diff">${diff(prevSource, r.source)}</pre></details>`;
  return `${h}</div>`;
}

let sections = "";
const keys = [...new Set(records.map((r) => `${r.sequence}|${r.run}`))];
for (const key of keys) {
  const [seqId, run] = key.split("|");
  const seq = SEQUENCES.find((s) => s.id === seqId);
  const rs = records.filter((r) => r.sequence === seqId && String(r.run) === run);
  const tpl = TEMPLATES[rs[0].template];
  const first = rs.find((r) => r.step === 1);
  let body = `<h3>Shared first request</h3>${first ? stepBlock(first, tpl.source) : "<p>(missing)</p>"}`;
  const variants = [...new Set(rs.filter((r) => r.step > 1).map((r) => r.variant))].sort();
  body += `<div class="variants">`;
  for (const v of variants) {
    const vs = rs.filter((r) => r.variant === v).sort((a, b) => a.step - b.step);
    let prev = first?.source ?? tpl.source;
    let col = `<div class="variant"><h3>Variant ${esc(v)}</h3>`;
    for (const r of vs) {
      col += stepBlock(r, prev);
      if (r.source) prev = r.source;
    }
    const reached = vs.length === seq.steps.length - 1;
    col += reached ? "" : `<p class="muted">Stopped after step ${vs.at(-1)?.step ?? 1}.</p>`;
    // Final slip of this branch beside the base, for every example order.
    col += `<details><summary>Final slip vs base, every order</summary><div class="grid"><div class="h">Order</div><div class="h">Base</div><div class="h">After step ${vs.filter((r) => r.source).at(-1)?.step ?? 1}</div>`;
    for (const order of SHOP.orders) {
      col += `<div class="lbl">#${esc(order.number)} · ${esc(order.label)}</div>${frame(await render(tpl.source, order), tpl.paper)}${frame(await render(prev, order), tpl.paper)}`;
    }
    col += `</div></details></div>`;
    body += col;
  }
  body += `</div>`;
  sections += `<section class="run"><h2>${esc(seqId)} <span class="muted">· ${esc(tpl.name)} · ${esc(seq?.level ?? "")} · run ${esc(run)}</span></h2>${body}</section>`;
}

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tweak Test Review</title>
<style>
:root{--bg:#f6f5f2;--card:#fff;--ink:#1d1d1f;--muted:#6b6b70;--line:#e3e1dc;--add:#e6f4ea;--del:#fde8e8;--ok:#1e7a46;--warn:#a86400;--bad:#b42318}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#18181a;--card:#222225;--ink:#ececee;--muted:#9a9aa2;--line:#38383d;--add:#1d3a28;--del:#432222}}
:root[data-theme="dark"]{--bg:#18181a;--card:#222225;--ink:#ececee;--muted:#9a9aa2;--line:#38383d;--add:#1d3a28;--del:#432222}
body{margin:0;padding:16px;background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,sans-serif}
.wrap{max-width:1400px;margin:0 auto}h1{font-size:20px;margin:0 0 4px}h2{font-size:17px;margin:0 0 8px}h3{font-size:14px;margin:12px 0 6px}h4{font-size:13px;margin:0 0 4px}
.run{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;margin:14px 0}
.variants{display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:12px}
.variant{border-top:1px solid var(--line);padding-top:4px}
.step{border-left:3px solid var(--line);padding:4px 10px;margin:8px 0}
.muted{color:var(--muted);font-weight:400}.req{font-style:italic;margin:0 0 4px}p{margin:4px 0}ul{margin:4px 0;padding-left:18px}
.badge{font-size:12px;padding:2px 8px;border-radius:99px;color:#fff;vertical-align:1px}.ok{background:var(--ok)}.warn{background:var(--warn)}.bad{background:var(--bad)}
pre{overflow-x:auto;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:8px;font-size:12px;margin:6px 0}
.diff div{white-space:pre}.add{background:var(--add)}.del{background:var(--del)}.gap{color:var(--muted)}
.grid{display:grid;grid-template-columns:110px 1fr 1fr;gap:8px;margin-top:8px;align-items:start}
.h{font-weight:600;font-size:12px;color:var(--muted)}.lbl{font-size:12px;color:var(--muted);padding-top:6px}
iframe{width:100%;height:420px;border:1px solid var(--line);border-radius:6px;background:#fff}
summary{cursor:pointer;color:var(--muted)}
@media (max-width:760px){.grid{grid-template-columns:1fr}}
</style>
<script>
function fit(f){try{f.style.height=(f.contentDocument.documentElement.scrollHeight+4)+"px"}catch(e){}}
</script></head><body><div class="wrap">
<h1>Tweak test review</h1>
<p class="muted">${esc(dir)} · ${records.length} steps · A = full template restated, B = "Applied." only, C = "Applied." plus a hint</p>
${sections}
</div></body></html>`;

writeFileSync(join(dir, "review.html"), page);
console.log(`Wrote ${join(dir, "review.html")} (${records.length} steps). Open it in your browser.`);
