#!/usr/bin/env node
// Builds summary.html and summary.md for a turn-run.mjs results folder.
//
//   node turn-summary.mjs results/turns-<timestamp>
//
// summary.html: the token and cost tables, then for each input the design that was sent next
// to the starting template (Classic, Kiln & Co., default order) and every run's outcome, with
// the edited template rendered for the same order, the tool arguments and the edited source.
// summary.md: the token and cost tables only, for pasting into a PR.
// Runs turn-run.mjs calls this at the end; rerun it any time on a finished or stopped run.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Liquid } from "liquidjs";
import { LIQUID_OPTIONS, SHOP, TEMPLATE_NAME, TEMPLATE_SOURCE, renderContext } from "./app-snapshot.mjs";

const liquid = new Liquid(LIQUID_OPTIONS);
const ORDER = SHOP.orders.find((o) => o.id === SHOP.defaultOrderId);

const readJsonl = (path) =>
  existsSync(path)
    ? readFileSync(path, "utf8")
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l))
    : [];
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const usd = (n) => `$${n.toFixed(6)}`;
const num = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "");
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const stat = (xs) => ({ avg: avg(xs), min: xs.length ? Math.min(...xs) : NaN, max: xs.length ? Math.max(...xs) : NaN, sum: xs.reduce((a, b) => a + b, 0) });

async function render(source) {
  try {
    return { html: await liquid.parseAndRender(source, renderContext(SHOP, ORDER)) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** A rendered slip in an iframe at Letter width, scaled down to fit a card. */
function slipFrame(rendered, label) {
  if (rendered.error) return `<div class="frame error">Render failed: ${esc(rendered.error)}</div>`;
  const doc = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#fff">${rendered.html}</body></html>`;
  return `<div class="frame"><iframe title="${esc(label)}" sandbox srcdoc="${esc(doc)}"></iframe></div>`;
}

function reference(input) {
  if (!input?.sent?.mediaFile) return `<div class="frame error">Not found</div>`;
  if (input.sent.type === "input_file") {
    return `<div class="frame pdf"><iframe title="${esc(input.id)}" src="${esc(input.sent.mediaFile)}"></iframe></div>`;
  }
  return `<div class="frame img"><img alt="${esc(input.id)}" src="${esc(input.sent.mediaFile)}"></div>`;
}

function outcomeText(r) {
  switch (r.type) {
    case "edit":
      return `Edit: ${r.summary}`;
    case "ask":
      return `Asked: ${r.question}${r.options?.length ? ` [${r.options.join(" | ")}]` : ""}`;
    case "asset":
      return `Requested asset: ${r.description}`;
    case "reply":
      return `Replied${r.viaText ? " (text, no tool)" : ""}: ${r.message}`;
    default:
      return `Error: ${r.error}${r.detail ? ` (${typeof r.detail === "string" ? r.detail : JSON.stringify(r.detail)})` : ""}`;
  }
}

function tables(runs, calls, inputIds) {
  const byInput = inputIds.map((id) => {
    const rs = runs.filter((r) => r.input === id);
    const cs = calls.filter((c) => c.input === id && c.status >= 200 && c.status < 300);
    const first = cs.filter((c) => c.attempt === 1 && !c.retry).map((c) => c.usage.input_tokens);
    const outcomes = {};
    for (const r of rs) outcomes[r.result.type] = (outcomes[r.result.type] ?? 0) + 1;
    return {
      id,
      runs: rs.length,
      outcomes,
      calls: cs.length,
      first: stat(first),
      input: stat(rs.map((r) => r.totals.input_tokens)),
      cached: stat(rs.map((r) => r.totals.cached)),
      output: stat(rs.map((r) => r.totals.output_tokens)),
      reasoning: stat(rs.map((r) => r.totals.reasoning)),
      cost: stat(rs.map((r) => r.totals.costUsd)),
    };
  });
  const outcomeStr = (o) => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(", ");

  const averages = [
    "| Input | Runs | Outcomes | Calls | 1st-call input (avg · min–max) | Input / run (avg) | Cached / run (avg) | Output / run (avg) | Reasoning / run (avg) | Cost / run (avg · min–max) | Cost, all runs |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...byInput.map(
      (s) =>
        `| ${s.id} | ${s.runs} | ${outcomeStr(s.outcomes)} | ${s.calls} | ${num(s.first.avg)} · ${num(s.first.min)}–${num(s.first.max)} | ${num(s.input.avg)} | ${num(s.cached.avg)} | ${num(s.output.avg)} | ${num(s.reasoning.avg)} | ${s.runs ? usd(s.cost.avg) : ""} · ${s.runs ? `${usd(s.cost.min)}–${usd(s.cost.max)}` : ""} | ${usd(s.cost.sum)} |`,
    ),
  ];
  const all = stat(runs.map((r) => r.totals.costUsd));
  averages.push(`| **All** | ${runs.length} | | ${calls.filter((c) => c.status >= 200 && c.status < 300).length} | | | | | | ${runs.length ? usd(all.avg) : ""} | ${usd(all.sum)} |`);

  const exact = [
    "| Input | Run | Attempt | HTTP | Input tokens | Cached | Output | Reasoning | Cost | Latency |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...calls.map(
      (c) =>
        `| ${c.input} | ${c.run} | ${c.attempt}${c.retry ? ` (retry ${c.retry})` : ""} | ${c.status} | ${num(c.usage.input_tokens)} | ${num(c.usage.cached)} | ${num(c.usage.output_tokens)} | ${num(c.usage.reasoning)} | ${usd(c.costUsd)} | ${(c.ms / 1000).toFixed(1)} s |`,
    ),
  ];
  return { averages: averages.join("\n"), exact: exact.join("\n") };
}

/** A Markdown table as HTML (just enough for the tables above). */
function mdTableToHtml(md) {
  const rows = md.split("\n").filter((l, i) => i !== 1);
  const cells = (l) => l.split("|").slice(1, -1).map((c) => c.trim().replace(/^\*\*(.*)\*\*$/, "<b>$1</b>"));
  const [head, ...body] = rows;
  return `<table><thead><tr>${cells(head).map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${body
    .map((l) => `<tr>${cells(l).map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

export async function buildSummary(dir) {
  const config = JSON.parse(readFileSync(join(dir, "config.json"), "utf8"));
  const inputs = existsSync(join(dir, "inputs.json")) ? JSON.parse(readFileSync(join(dir, "inputs.json"), "utf8")) : [];
  const runs = readJsonl(join(dir, "runs.jsonl"));
  const calls = readJsonl(join(dir, "calls.jsonl"));
  const inputIds = [...new Set([...inputs.map((i) => i.id), ...runs.map((r) => r.input)])];
  const { averages, exact } = tables(runs, calls, inputIds);

  const header = [
    `Model \`${config.model}\`, shop ${SHOP.name}, template ${TEMPLATE_NAME}, message "${config.message}".`,
    `Images limited to ${num(config.maxPixels)} px; PDFs sent as the file. Rendered for order #${ORDER.number} (${ORDER.label}).`,
    `${num(config.calls ?? calls.length)} call(s), ${usd(config.spentUsd ?? 0)} spent.${config.stopped ? ` Stopped early: ${config.stopped}.` : ""}${config.interrupted ? " Interrupted." : ""}`,
    `Prices: input $0.10, cached input $0.004, output $0.50 per 1M tokens (reasoning is billed as output).`,
  ];

  const md = [
    "# Make it look like this: token cost",
    "",
    ...header.map((l) => `${l}  `),
    "",
    "## Per input (averages per run)",
    "",
    averages,
    "",
    "## Every call",
    "",
    exact,
    "",
  ].join("\n");
  const mdPath = join(dir, "summary.md");
  writeFileSync(mdPath, md);

  const before = await render(TEMPLATE_SOURCE);
  const sections = [];
  for (const id of inputIds) {
    const input = inputs.find((i) => i.id === id);
    const sent = input?.sent
      ? input.sent.type === "input_file"
        ? `PDF file, ${num(input.sent.bytes)} bytes`
        : `${input.sent.width}×${input.sent.height} (${num(input.sent.pixels)} px), ${num(input.sent.bytes)} bytes${input.sent.resized ? `, resized from ${input.original.width}×${input.original.height}` : ", original"}`
      : "";
    const cards = [];
    for (const r of runs.filter((x) => x.input === id)) {
      const res = r.result;
      const after = res.type === "edit" ? slipFrame(await render(res.templateSource), `${id} run ${r.run}`) : `<div class="frame none">No edit</div>`;
      const rejected = r.rejections?.length
        ? `<details><summary>${r.rejections.length} rejected attempt(s)</summary>${r.rejections
            .map((x) => `<p><b>Attempt ${x.attempt}${x.tool ? ` (${esc(x.tool)})` : ""}:</b> ${esc(x.feedback)}</p>${x.arguments ? `<pre>${esc(x.arguments)}</pre>` : ""}`)
            .join("")}</details>`
        : "";
      cards.push(`<div class="card">
  <h4>Run ${r.run} · ${esc(res.type)}</h4>
  <p class="outcome">${esc(outcomeText(res))}</p>
  <p class="meta">${r.calls.length} call(s) · in ${num(r.totals.input_tokens)} (cached ${num(r.totals.cached)}) · out ${num(r.totals.output_tokens)} (reasoning ${num(r.totals.reasoning)}) · ${usd(r.totals.costUsd)} · ${(r.ms / 1000).toFixed(1)} s</p>
  ${after}
  ${rejected}
  ${res.arguments ? `<details><summary>Tool arguments</summary><pre>${esc(res.arguments)}</pre></details>` : ""}
  ${res.templateSource ? `<details><summary>Edited template</summary><pre>${esc(res.templateSource)}</pre></details>` : ""}
</div>`);
    }
    sections.push(`<section>
  <h2>${esc(id)}</h2>
  <p class="meta">${esc(input?.file ?? "")} · sent as ${esc(sent)}</p>
  <div class="pair">
    <div><h3>Sent design</h3>${reference(input)}</div>
    <div><h3>Starting template (${esc(TEMPLATE_NAME)})</h3>${slipFrame(before, "Starting template")}</div>
  </div>
  <h3>Runs</h3>
  <div class="grid">${cards.join("\n") || "<p>No runs.</p>"}</div>
</section>`);
  }

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Make it look like this</title>
<style>
  :root { --scale: 0.42; --w: 816px; --h: 1056px; }
  body { font: 14px/1.5 system-ui, sans-serif; margin: 24px; color: #1d1d1b; background: #fafaf8; }
  table { border-collapse: collapse; margin: 8px 0 24px; font-variant-numeric: tabular-nums; }
  th, td { border: 1px solid #ddd; padding: 4px 8px; text-align: right; white-space: nowrap; }
  th:first-child, td:first-child, td:nth-child(3) { text-align: left; }
  th { background: #f0efea; font-weight: 600; }
  section { margin: 32px 0; border-top: 2px solid #ccc; padding-top: 8px; }
  .meta { color: #666; font-size: 13px; }
  .pair, .grid { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
  .card { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 10px 12px; width: calc(var(--w) * var(--scale) + 2px); }
  .card h4 { margin: 0 0 4px; }
  .outcome { margin: 0 0 4px; }
  .frame { width: calc(var(--w) * var(--scale)); height: calc(var(--h) * var(--scale)); overflow: hidden; border: 1px solid #ccc; background: #fff; }
  .frame iframe { width: var(--w); height: var(--h); border: 0; transform: scale(var(--scale)); transform-origin: 0 0; }
  .frame.pdf iframe { width: 100%; height: 100%; transform: none; }
  .frame.img { display: flex; align-items: center; justify-content: center; }
  .frame.img img { max-width: 100%; max-height: 100%; }
  .frame.none, .frame.error { display: flex; align-items: center; justify-content: center; color: #888; padding: 8px; box-sizing: border-box; }
  .frame.error { color: #a32d2d; }
  pre { white-space: pre-wrap; word-break: break-word; font-size: 11px; background: #f6f6f3; padding: 8px; max-height: 400px; overflow: auto; }
  details { margin-top: 6px; }
</style></head><body>
<h1>Make it look like this</h1>
${header.map((l) => `<p class="meta">${esc(l)}</p>`).join("\n")}
<h2>Per input (averages per run)</h2>
${mdTableToHtml(averages)}
<details><summary>Every call (${calls.length})</summary>${mdTableToHtml(exact)}</details>
${sections.join("\n")}
</body></html>`;
  const htmlPath = join(dir, "summary.html");
  writeFileSync(htmlPath, html);
  return { html: htmlPath, md: mdPath };
}

// CLI: node turn-summary.mjs <results dir>
if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir || !existsSync(join(dir, "config.json"))) {
    console.error("Usage: node turn-summary.mjs results/turns-<timestamp>");
    process.exit(1);
  }
  const { html, md } = await buildSummary(dir);
  console.log(`Wrote ${html}\n      ${md}`);
}
