#!/usr/bin/env node
// Tweak experiment for #40: what should Flint's tool result say after an accepted edit, inside a
// change? Each sequence is one conversation shaped the way #42 will send it:
//
//   instructions  buildInstructions(shop), resent every request
//   input         [user: base template + "Request: <first request>"]          (buildUserMessage)
//                 + any retry items for that request (rejected edits, nudges), as the app sends them
//                 + the accepted response's items (replayItems: reasoning, function_call)
//                 + function_call_output for that call: the wording under test
//                 + [user: "Request: <tweak>"] ... and so on for each tweak
//
// Each request must start with the previous request's input, unchanged; the script checks this.
//
// Variants (the function_call_output after an accepted edit):
//   A  "Applied. The template is now:" + the full template
//   B  "Applied."
//   C  "Applied." + a one-line hint that later finds must match the template with this edit in it
//
// The first request of a sequence runs once and its accepted edit is shared by every variant, so
// they're compared from the same starting point; only the tweaks differ. Variant order rotates.
//
// Everything Flint-specific comes from src/ (bundled by lib.mjs): instructions, tools, user
// message, retry and nudge wording, MAX_ATTEMPTS, applyEdits, validateTemplate, shops, templates.
// Checks render each slip in headless Chromium and look at what it shows (browser.mjs).
//
// API key: MODEL_API_KEY=... in tweak-test/.env (or limit-test/.env). Optional MODEL_API_BASE_URL.
//
// Usage:
//   node tweak-test/tweak-test.mjs --self-test     check the checks against reference answers (free)
//   node tweak-test/tweak-test.mjs --dry-run       estimate tokens and cost; no calls
//   node tweak-test/tweak-test.mjs --mock          whole pipeline offline, reference answers as Ember
//   node tweak-test/tweak-test.mjs                 live run (runs the self-test first)
//
// Options (defaults in brackets):
//   --runs=N              repetitions of every sequence [1]
//   --variants=A,B,C      which tool-result wordings to compare [A,B,C]
//   --only=ids            sequence ids, e.g. C3-promo,K4-option-columns
//   --templates=ids       classic,compact [both]
//   --max-calls=N         hard cap on API calls, retries included [400]
//   --token-budget=N      hard cap on total tokens, input + output [3000000]
//   --timeout-s=N         per-call HTTP timeout [180]
//   --print-request       print each sequence's first request body and exit
//   --skip-self-test      don't run the self-test before a live or mock run
//
// Output (tweak-test/results/<timestamp>/), appended as the run goes:
//   calls.jsonl     every API call: exact request body, raw response or error, status, latency
//   steps.jsonl     every step of every branch: outcome, attempts, rejections, tokens, check
//   config.json     the settings used (no key)
//   results.json + summary.md   at the end, or on Ctrl-C / crash

import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openBrowser } from "./browser.mjs";
import { HERE, loadEnv, loadFlint } from "./lib.mjs";
import { REFERENCES } from "./references.mjs";
import { SEQUENCES } from "./sequences.mjs";

const envFile = loadEnv();

// ---------------- config ----------------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  }),
);
const int = (v, d) => (v === undefined ? d : Number.parseInt(v, 10));
const list = (v, d) => (v === undefined || v === true ? d : String(v).split(",").filter(Boolean));

const CONFIG = {
  apiKey: process.env.MODEL_API_KEY,
  baseUrl: process.env.MODEL_API_BASE_URL,
  runs: int(args.runs, 1),
  variants: list(args.variants, ["A", "B", "C"]),
  only: list(args.only, null),
  templates: list(args.templates, ["classic", "compact"]),
  maxCalls: int(args["max-calls"], 400),
  tokenBudget: int(args["token-budget"], 3_000_000),
  timeoutMs: int(args["timeout-s"], 180) * 1000,
  selfTest: !!args["self-test"],
  skipSelfTest: !!args["skip-self-test"],
  dryRun: !!args["dry-run"],
  mock: !!args.mock,
  printRequest: !!args["print-request"],
  shopId: "kiln-and-co",
  // Dry-run estimates only: per-call output, and how much a tweak adds besides a restated template.
  typicalOutput: 700,
  typicalCacheHit: 0.85,
  tweakOverheadTokens: 900,
};

const die = (msg) => {
  console.error(`error: ${msg}`);
  process.exit(1);
};

const TOOL_RESULTS = {
  A: (source) => `Applied. The template is now:\n\`\`\`liquid\n${source}\n\`\`\``,
  B: () => "Applied.",
  C: () => "Applied. Later finds must match the template with this edit in it.",
};
for (const v of CONFIG.variants) if (!TOOL_RESULTS[v]) die(`unknown variant: ${v}`);
for (const t of CONFIG.templates) if (!["classic", "compact"].includes(t)) die(`unknown template: ${t}`);

const F = await loadFlint();
CONFIG.baseUrl ??= F.DEFAULT_EMBER_BASE_URL;
const SHOP = F.shops.find((s) => s.id === CONFIG.shopId);
const TEMPLATES = Object.fromEntries(F.builtInTemplates.map((t) => [t.id, t]));
const INSTRUCTIONS = F.buildInstructions(SHOP);

const sequences = SEQUENCES.filter((s) => CONFIG.templates.includes(s.template) && (!CONFIG.only || CONFIG.only.includes(s.id)));
if (!sequences.length) die("no sequences selected");
if (!CONFIG.dryRun && !CONFIG.mock && !CONFIG.printRequest && !CONFIG.selfTest && !CONFIG.apiKey) {
  die(`MODEL_API_KEY is not set. Put MODEL_API_KEY=your-key in ${join(HERE, ".env")} (or use --self-test / --dry-run / --mock)`);
}

// ---------------- checks (rendered in a real browser) ----------------
const hash = (s) => createHash("sha1").update(s).digest("hex").slice(0, 16);
let browser;

async function view(source, number) {
  const order = SHOP.orders.find((o) => o.number === number);
  if (!order) throw new Error(`no example order #${number}`);
  const html = await F.renderSlip(source, SHOP, order);
  const paper = templateOfSource.get(source) ?? "letter";
  return browser.view(html, paper, SHOP.assets, `${hash(source)}|${number}`);
}
// Paper size per template source (every source a sequence produces inherits its template's paper).
const templateOfSource = new Map();

/** Runs a step's check on `source`; `earlier` are the sources after each earlier step. */
async function runCheck(seq, stepIndex, source, earlier) {
  const paper = TEMPLATES[seq.template].paper;
  for (const s of [source, ...earlier, TEMPLATES[seq.template].source]) templateOfSource.set(s, paper);
  const ctx = {
    numbers: SHOP.orders.map((o) => o.number),
    order: (n) => SHOP.orders.find((o) => o.number === n),
    now: (n) => view(source, n),
    base: (n) => view(TEMPLATES[seq.template].source, n),
    step: (i, n) => view(earlier[i], n),
  };
  try {
    const [ok, detail] = await seq.steps[stepIndex].check(ctx);
    return { ok, detail };
  } catch (e) {
    return { ok: false, detail: `check crashed: ${e.message}` };
  } finally {
    // Keep only the base templates' pages between checks.
    const keep = Object.values(TEMPLATES).map((t) => `${hash(t.source)}|`);
    await browser.release(keep);
  }
}

// ---------------- self-test: the checks against the reference answers ----------------
async function selfTest() {
  console.log("Self-test: each check must pass on its reference answer and fail on the template before that step.");
  const problems = [];
  for (const seq of sequences) {
    const refs = REFERENCES[seq.id];
    if (!refs || refs.length !== seq.steps.length) {
      problems.push(`${seq.id}: references missing or wrong length`);
      continue;
    }
    let source = TEMPLATES[seq.template].source;
    const earlier = [];
    for (const [i, edits] of refs.entries()) {
      const applied = F.applyEdits(source, edits);
      if (!applied.ok) {
        problems.push(`${seq.id} step ${i + 1}: reference edit doesn't apply: ${applied.error}`);
        break;
      }
      const valid = await F.validateTemplate(applied.source, SHOP);
      if (!valid.ok) {
        problems.push(`${seq.id} step ${i + 1}: reference isn't valid Liquid: ${valid.error}`);
        break;
      }
      const pass = await runCheck(seq, i, applied.source, earlier);
      const before = await runCheck(seq, i, source, earlier);
      const line = `${seq.id} step ${i + 1}: reference ${pass.ok ? "passes" : "FAILS"}, previous template ${before.ok ? "ALSO PASSES" : "fails"}`;
      console.log(`  ${pass.ok && !before.ok ? "ok " : "BAD"} ${line}`);
      if (!pass.ok) problems.push(`${line}: ${pass.detail}`);
      if (before.ok) problems.push(`${line}: the check doesn't detect the change (${before.detail})`);
      earlier.push(applied.source);
      source = applied.source;
    }
  }
  if (problems.length) {
    console.log(`\nSelf-test found ${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    return false;
  }
  console.log("Self-test passed.\n");
  return true;
}

// ---------------- Ember calls, budget, logging ----------------
const state = { calls: 0, input: 0, cached: 0, output: 0, reasoning: 0 };
const LOG = { dir: null, inflight: null };
const logLine = (file, obj) => LOG.dir && appendFileSync(join(LOG.dir, file), JSON.stringify(obj) + "\n");
const estTokens = (body) => Math.ceil(JSON.stringify(body).length / 3.2); // conservative chars -> tokens
const costUsd = (u) => F.costNanoUsd({ inputTokens: u.input, cachedInputTokens: u.cached, outputTokens: u.output }) / F.NANO_USD_PER_USD;

class Stop extends Error {}

async function callEmber(input, meta) {
  const body = F.requestBody({ instructions: INSTRUCTIONS, input, tools: F.TOOLS });
  if (state.calls >= CONFIG.maxCalls) throw new Stop(`call cap reached (${CONFIG.maxCalls})`);
  const spent = state.input + state.output;
  const worst = estTokens(body) + F.MAX_OUTPUT_TOKENS;
  if (spent + worst > CONFIG.tokenBudget) throw new Stop(`token budget would be exceeded (spent ${spent}, next call worst case ${worst}, budget ${CONFIG.tokenBudget})`);
  state.calls++;

  const entry = { seq: state.calls, startedAt: new Date().toISOString(), ...meta, url: `${CONFIG.baseUrl.replace(/\/+$/, "")}/responses`, requestBody: body };
  const t0 = Date.now();
  LOG.inflight = entry;
  let data;
  try {
    if (CONFIG.mock) {
      data = mockResponse(meta, input);
      entry.httpStatus = "mock";
      entry.response = data;
    } else {
      const res = await fetch(entry.url, {
        method: "POST",
        headers: { authorization: `Bearer ${CONFIG.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(CONFIG.timeoutMs),
      });
      const text = await res.text();
      entry.httpStatus = res.status;
      entry.requestId = res.headers.get("x-request-id") ?? undefined;
      try {
        entry.response = JSON.parse(text);
      } catch {
        entry.responseText = text;
      }
      if ([401, 403, 404].includes(res.status)) throw new Stop(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      if (entry.response === undefined) throw new Error(`response was not JSON: ${text.slice(0, 200)}`);
      data = entry.response;
    }
  } catch (e) {
    entry.error = e.message; // a timed-out call may still be billed
    throw e;
  } finally {
    LOG.inflight = null;
    entry.latencyMs = Date.now() - t0;
    logLine("calls.jsonl", entry);
  }

  const u = data.usage ?? {};
  const usage = {
    input: u.input_tokens ?? estTokens(body),
    cached: u.input_tokens_details?.cached_tokens ?? 0,
    output: u.output_tokens ?? F.MAX_OUTPUT_TOKENS, // unknown usage: assume the worst
    reasoning: u.output_tokens_details?.reasoning_tokens ?? 0,
  };
  state.input += usage.input;
  state.cached += usage.cached;
  state.output += usage.output;
  state.reasoning += usage.reasoning;
  return {
    status: data.status ?? "completed",
    output: Array.isArray(data.output) ? data.output : [],
    usage,
    latencyMs: entry.latencyMs,
    estimatedInput: estTokens(body),
  };
}

// ---------------- one request in a conversation (the app's turn loop, step for step) ----------------
function toolRejection(name, error) {
  return `${name} call rejected: ${error}. The template is unchanged. Call exactly one tool again with valid arguments.`;
}
const isString = (v) => typeof v === "string";
const isEdit = (v) => !!v && typeof v === "object" && isString(v.find) && isString(v.replace);

function rejectionKind(error) {
  if (/was not found in the template/.test(error)) return "find_not_found";
  if (/matches \d+ places/.test(error)) return "find_ambiguous";
  if (/`find` is empty|no edits were given|arguments must be|not a valid JSON/.test(error)) return "bad_args";
  return "liquid";
}

/**
 * Sends conv.items (plus retries) until Ember answers with an accepted edit, another tool, a text
 * reply, or runs out of attempts. Mutates conv.items exactly as the app's turn loop builds its
 * input. Returns the step record (without the check).
 */
async function request(conv, current, meta) {
  const attempts = [];
  const done = (outcome, extra = {}) => ({ outcome, attempts, ...extra });
  for (let attempt = 1; attempt <= F.MAX_ATTEMPTS; attempt++) {
    // Prefix rule: this request's input must start with everything the previous request sent.
    const prefixOk = conv.sent.every((s, i) => JSON.stringify(conv.items[i]) === s);
    let res;
    try {
      res = await callEmber(conv.items, { ...meta, attempt });
    } catch (e) {
      if (e instanceof Stop) throw e;
      return done("api_error", { detail: e.message });
    }
    conv.sent = conv.items.map((x) => JSON.stringify(x));
    const call = F.firstFunctionCall(res.output);
    const text = F.messageText(res.output).trim();
    const a = {
      usage: res.usage,
      latencyMs: res.latencyMs,
      inputItems: conv.items.length,
      prefixOk,
      status: res.status,
      toolCall: call ? { name: call.name, arguments: call.arguments } : null,
      text: text || null,
    };
    attempts.push(a);

    if (res.status === "incomplete") return done("too_big");

    if (!call) {
      if (attempt === 1 && text) return done("reply", { message: text });
      a.rejection = { kind: "text", error: "replied with text instead of calling a tool" };
      conv.items.push(...F.replayItems(res.output), { role: "user", content: F.TEXT_ON_RETRY_NUDGE });
      continue;
    }

    let feedback;
    let parsed;
    try {
      parsed = JSON.parse(call.arguments);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) parsed = undefined;
    } catch {
      parsed = undefined;
    }

    if (!parsed) {
      const error = "the arguments are not a valid JSON object";
      feedback = call.name === "edit_template" ? F.editRejection(error) : toolRejection(call.name, error);
      a.rejection = { kind: "bad_args", error };
    } else if (call.name === "edit_template") {
      const { edits, summary } = parsed;
      if (!Array.isArray(edits) || !edits.every(isEdit) || !isString(summary)) {
        const error = "the arguments must be { edits: { find: string, replace: string }[], summary: string }";
        feedback = F.editRejection(error);
        a.rejection = { kind: "bad_args", error };
      } else {
        const applied = F.applyEdits(current, edits);
        const valid = applied.ok ? await F.validateTemplate(applied.source, SHOP) : null;
        const error = !applied.ok ? applied.error : !valid.ok ? valid.error : null;
        if (error) {
          feedback = F.editRejection(error);
          a.rejection = { kind: rejectionKind(error), error };
        } else {
          a.edits = edits.length;
          return done("edit", { source: applied.source, summary, output: res.output, callId: call.call_id, validOnAttempt: attempt });
        }
      }
    } else if (call.name === "ask_clarification") {
      if (isString(parsed.question)) return done("ask", { message: parsed.question, options: parsed.options });
      feedback = toolRejection(call.name, "`question` must be a string");
      a.rejection = { kind: "bad_args", error: feedback };
    } else if (call.name === "request_asset") {
      if (isString(parsed.description)) return done("asset", { message: parsed.description });
      feedback = toolRejection(call.name, "`description` must be a string");
      a.rejection = { kind: "bad_args", error: feedback };
    } else if (call.name === "reply") {
      if (isString(parsed.message)) return done("reply", { message: parsed.message });
      feedback = toolRejection(call.name, "`message` must be a string");
      a.rejection = { kind: "bad_args", error: feedback };
    } else {
      feedback = `Unknown tool ${call.name}. The template is unchanged. Call one of: ${F.TOOLS.map((t) => t.name).join(", ")}.`;
      a.rejection = { kind: "bad_args", error: feedback };
    }
    conv.items.push(...F.replayItems(res.output), { type: "function_call_output", call_id: call.call_id, output: feedback });
  }
  return done("invalid", { detail: attempts.at(-1)?.rejection?.error ?? "" });
}

// ---------------- offline stand-in for Ember ----------------
// Answers with the reference edits. On a variant B tweak's first attempt it sends a find that
// isn't in the template, so the rejection and retry path runs too.
function mockResponse(meta, input) {
  const id = `call_${Math.random().toString(36).slice(2, 8)}`;
  const refs = REFERENCES[meta.sequence][meta.step - 1];
  const bad = meta.variant === "B" && meta.step > 1 && meta.attempt === 1;
  const args = { edits: bad ? [{ find: "NOT IN THE TEMPLATE", replace: "x" }] : refs, summary: `mock step ${meta.step}` };
  const inputTokens = Math.ceil(JSON.stringify(input).length / 3.6) + 1800;
  return {
    id: `resp_${id}`,
    status: "completed",
    output: [
      { type: "reasoning", id: `rs_${id}`, summary: [], encrypted_content: "ENCRYPTED" },
      { type: "function_call", id: `fc_${id}`, call_id: id, name: "edit_template", arguments: JSON.stringify(args), status: "completed" },
    ],
    usage: {
      input_tokens: inputTokens,
      input_tokens_details: { cached_tokens: Math.floor(inputTokens * 0.8) },
      output_tokens: 400,
      output_tokens_details: { reasoning_tokens: 250 },
    },
  };
}

// ---------------- one sequence: shared first request, then a branch per variant ----------------
function stepUsage(attempts) {
  const u = { input: 0, cached: 0, output: 0, reasoning: 0 };
  for (const a of attempts) for (const k of Object.keys(u)) u[k] += a.usage[k];
  return { ...u, uncached: u.input - u.cached, costUsd: costUsd(u) };
}

async function recordStep(base, seq, stepIndex, result, earlier) {
  const step = seq.steps[stepIndex];
  const rec = {
    ...base,
    step: stepIndex + 1,
    finds: step.finds ?? "first",
    request: step.text,
    outcome: result.outcome,
    detail: result.detail ?? result.message ?? "",
    summary: result.summary,
    attempts: result.attempts,
    validOnAttempt: result.validOnAttempt,
    rejections: result.attempts.filter((a) => a.rejection).length,
    findRejections: result.attempts.filter((a) => a.rejection?.kind?.startsWith("find_")).length,
    prefixOk: result.attempts.every((a) => a.prefixOk),
    usage: stepUsage(result.attempts),
  };
  if (result.outcome === "edit") {
    rec.source = result.source;
    rec.check = await runCheck(seq, stepIndex, result.source, earlier);
  }
  logLine("steps.jsonl", rec);
  return rec;
}

async function runSequence(seq, run, order) {
  const template = TEMPLATES[seq.template];
  const records = [];
  const base = { run, sequence: seq.id, template: seq.template, level: seq.level };

  // First request: shared by every variant.
  const first = {
    items: [{ role: "user", content: F.buildUserMessage({ templateSource: template.source, history: [], message: seq.steps[0].text }) }],
    sent: [],
  };
  const r1 = await request(first, template.source, { sequence: seq.id, run, variant: "shared", step: 1 });
  const s1 = await recordStep({ ...base, variant: "shared" }, seq, 0, r1, []);
  records.push(s1);
  print(s1);
  if (r1.outcome !== "edit") return records;

  for (const variant of order) {
    const conv = { items: structuredClone(first.items), sent: [...first.sent] };
    let current = r1.source;
    let last = r1;
    const earlier = [r1.source];
    for (let i = 1; i < seq.steps.length; i++) {
      // The accepted edit, its tool result (the wording under test), then the tweak.
      conv.items.push(
        ...F.replayItems(last.output),
        { type: "function_call_output", call_id: last.callId, output: TOOL_RESULTS[variant](current) },
        { role: "user", content: `Request: ${seq.steps[i].text}` },
      );
      const r = await request(conv, current, { sequence: seq.id, run, variant, step: i + 1 });
      const rec = await recordStep({ ...base, variant }, seq, i, r, [...earlier]);
      records.push(rec);
      print(rec);
      if (r.outcome !== "edit") break; // a question, reply or failure ends this branch: no seller to answer
      current = r.source;
      last = r;
      earlier.push(r.source);
    }
  }
  return records;
}

function print(r) {
  const tok = state.input + state.output;
  const check = r.check ? (r.check.ok ? "check ok" : `check FAIL: ${r.check.detail.slice(0, 100)}`) : r.detail.slice(0, 100);
  console.log(
    `  ${r.sequence} run ${r.run} ${r.variant.padEnd(6)} step ${r.step}: ${r.outcome} after ${r.attempts.length} attempt(s)` +
      `${r.rejections ? `, ${r.rejections} rejected` : ""}${r.prefixOk ? "" : ", PREFIX BROKEN"} · ${check}  [calls ${state.calls}, tokens ${tok.toLocaleString()}]`,
  );
}

// ---------------- summary ----------------
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : "-");
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const num = (x, digits = 0) => (Number.isFinite(x) ? x.toFixed(digits) : "-");

function tweakRow(label, rs) {
  const n = rs.length;
  const edits = rs.filter((r) => r.outcome === "edit");
  const passed = edits.filter((r) => r.check?.ok).length;
  const asked = rs.filter((r) => ["ask", "asset", "reply"].includes(r.outcome)).length;
  const failed = rs.filter((r) => ["invalid", "too_big", "api_error"].includes(r.outcome)).length;
  const input = rs.reduce((s, r) => s + r.usage.input, 0), cached = rs.reduce((s, r) => s + r.usage.cached, 0);
  return `| ${label} | ${n} | ${pct(passed, n)} | ${pct(edits.length, n)} | ${asked} | ${failed} | ${rs.reduce((s, r) => s + r.findRejections, 0)} | ${rs.reduce((s, r) => s + r.rejections, 0)} | ${num(avg(rs.map((r) => r.attempts.length)), 2)} | ${num(avg(rs.map((r) => r.usage.input)))} | ${num(avg(rs.map((r) => r.usage.uncached)))} | ${pct(cached, input)} | ${num(avg(rs.map((r) => r.usage.output)))} | $${num(avg(rs.map((r) => r.usage.costUsd)) * 1000, 3)} | ${rs.every((r) => r.prefixOk) ? "yes" : "NO"} |`;
}
const TWEAK_HEAD = [
  "| group | tweaks | check pass | edit accepted | asked/replied | gave up | find rejections | all rejections | attempts / tweak | input tok / tweak | uncached tok / tweak | cached share | output tok / tweak | cost / 1000 tweaks | prefix kept |",
  "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
];

function summarize(records) {
  const tweaks = records.filter((r) => r.step > 1);
  const out = ["# Tweak experiment results", ""];
  const table = (title, groups) => {
    out.push(`## ${title}`, "", ...TWEAK_HEAD);
    for (const [label, rs] of groups) if (rs.length) out.push(tweakRow(label, rs));
    out.push("");
  };
  const by = (keys) => {
    const m = new Map();
    for (const r of tweaks) {
      const k = keys.map((key) => r[key]).join(" / ");
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return [...m].sort((a, b) => a[0].localeCompare(b[0]));
  };
  table("Tweaks by variant", by(["variant"]));
  table("Tweaks by variant and template", by(["variant", "template"]));
  table("Tweaks by variant and where the edit lands (own = Ember's earlier code, orig = original template)", by(["variant", "finds"]));
  table("Tweaks by variant and step", by(["variant", "step"]));

  // Final slip per sequence and variant: did the last step happen, and does it pass?
  out.push("## Final slip per sequence", "", "Step marks: ✓ accepted and passed its check, ✗ accepted but failed its check, otherwise the outcome. (n) = attempts.", "");
  out.push(`| sequence | run | first request | ${CONFIG.variants.join(" | ")} |`, `|---|---|---|${CONFIG.variants.map(() => "---|").join("")}`);
  const mark = (r) => (r ? `${r.outcome === "edit" ? (r.check?.ok ? "✓" : "✗") : r.outcome}(${r.attempts.length})` : "·");
  const finals = {};
  for (const seq of sequences)
    for (let run = 1; run <= CONFIG.runs; run++) {
      const rs = records.filter((r) => r.sequence === seq.id && r.run === run);
      const first = rs.find((r) => r.step === 1);
      if (!first) continue;
      const cells = CONFIG.variants.map((v) => {
        const steps = seq.steps.slice(1).map((_, i) => rs.find((r) => r.variant === v && r.step === i + 2));
        const lastStep = steps.at(-1);
        const ok = lastStep?.outcome === "edit" && lastStep.check?.ok;
        (finals[v] ??= []).push(ok);
        return `${steps.map(mark).join(" ")}${ok ? " **final ✓**" : ""}`;
      });
      out.push(`| ${seq.id} | ${run} | ${mark(first)} | ${cells.join(" | ")} |`);
    }
  out.push("", `Final slip correct: ${CONFIG.variants.map((v) => `${v} ${finals[v]?.filter(Boolean).length ?? 0}/${finals[v]?.length ?? 0}`).join(" · ")}`, "");

  const firsts = records.filter((r) => r.step === 1);
  out.push(`First requests (shared by every variant): ${firsts.length}, ${pct(firsts.filter((r) => r.outcome === "edit" && r.check?.ok).length, firsts.length)} passed their check.`, "");
  return out.join("\n");
}

// ---------------- dry run ----------------
function estimate() {
  let calls = 0, input = 0, output = 0;
  for (const seq of sequences) {
    const tpl = TEMPLATES[seq.template];
    const firstBody = F.requestBody({
      instructions: INSTRUCTIONS,
      input: [{ role: "user", content: F.buildUserMessage({ templateSource: tpl.source, history: [], message: seq.steps[0].text }) }],
      tools: F.TOOLS,
    });
    const t0 = estTokens(firstBody), tplTokens = Math.ceil(tpl.source.length / 3.2);
    calls += 1;
    input += t0;
    for (const v of CONFIG.variants)
      for (let k = 1; k < seq.steps.length; k++) {
        calls++;
        input += t0 + k * CONFIG.tweakOverheadTokens + (v === "A" ? k * tplTokens : 0);
      }
  }
  calls *= CONFIG.runs;
  input *= CONFIG.runs;
  output = calls * CONFIG.typicalOutput;
  const cost = (cachedShare, out) => costUsd({ input, cached: Math.round(input * cachedShare), output: out });
  return { calls, input, output, typical: cost(CONFIG.typicalCacheHit, output), worst: cost(0, calls * F.MAX_OUTPUT_TOKENS) };
}

// ---------------- main ----------------
async function main() {
  const est = estimate();
  console.log(`Sequences: ${sequences.map((s) => s.id).join(", ")} · variants ${CONFIG.variants.join(", ")} · runs ${CONFIG.runs}`);
  console.log(`Planned: ~${est.calls} calls before retries (up to ${F.MAX_ATTEMPTS} attempts each), ~${est.input.toLocaleString()} input tokens`);
  console.log(`Estimated cost: typical ~$${est.typical.toFixed(3)} (~${Math.round(CONFIG.typicalCacheHit * 100)}% cached), worst ~$${est.worst.toFixed(3)} (no cache, every call at the output cap, before retries)`);
  console.log(`Hard limits: ${CONFIG.maxCalls} calls, ${CONFIG.tokenBudget.toLocaleString()} tokens.${envFile ? ` Key from ${envFile}.` : ""}`);

  if (CONFIG.printRequest) {
    for (const seq of sequences) {
      const tpl = TEMPLATES[seq.template];
      const input = [{ role: "user", content: F.buildUserMessage({ templateSource: tpl.source, history: [], message: seq.steps[0].text }) }];
      console.log(`\n===== ${seq.id} (first request) =====\n${JSON.stringify(F.requestBody({ instructions: INSTRUCTIONS, input, tools: F.TOOLS }), null, 2)}`);
    }
    return;
  }
  if (CONFIG.dryRun) return;

  browser = await openBrowser(F);
  try {
    if (CONFIG.selfTest) {
      const ok = await selfTest();
      process.exitCode = ok ? 0 : 1;
      return;
    }
    if (!CONFIG.skipSelfTest && !(await selfTest())) die("the self-test failed, so the checks can't be trusted; fix them first (or pass --skip-self-test)");

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    LOG.dir = join(HERE, "results", `${stamp}${CONFIG.mock ? "-mock" : ""}`);
    mkdirSync(LOG.dir, { recursive: true });
    writeFileSync(join(LOG.dir, "config.json"), JSON.stringify({ ...CONFIG, apiKey: undefined, toolResults: Object.fromEntries(CONFIG.variants.map((v) => [v, TOOL_RESULTS[v]("<template>")])), startedAt: new Date().toISOString() }, null, 2));
    console.log(`Logging every call to ${join(LOG.dir, "calls.jsonl")} and every step to steps.jsonl`);

    const records = [];
    let stopReason = null, finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      const summary = summarize(records);
      const hit = state.input ? Math.round((100 * state.cached) / state.input) : 0;
      const totals = `Calls: ${state.calls} | input tokens ${state.input.toLocaleString()} (cached ${state.cached.toLocaleString()}, ${hit}%) | output ${state.output.toLocaleString()} (reasoning ${state.reasoning.toLocaleString()}) | cost ~$${costUsd(state).toFixed(4)}${stopReason ? `\nStopped early: ${stopReason}` : ""}`;
      writeFileSync(join(LOG.dir, "results.json"), JSON.stringify({ config: { ...CONFIG, apiKey: undefined }, totals: state, stopReason, records }, null, 2));
      writeFileSync(join(LOG.dir, "summary.md"), `${summary}\n${totals}\n`);
      console.log(`\n${summary}\n${totals}\n\nSaved in ${LOG.dir}. Build the visual review with: node tweak-test/review.mjs`);
    };
    process.once("SIGINT", () => {
      stopReason = "interrupted (Ctrl-C)";
      if (LOG.inflight) logLine("calls.jsonl", { ...LOG.inflight, error: "interrupted before the response arrived (may still be billed)" });
      finish();
      process.exit(130);
    });

    try {
      let k = 0;
      for (let run = 1; run <= CONFIG.runs; run++)
        for (const seq of sequences) {
          // Rotate which variant goes first, so no variant always runs on a cache another just warmed.
          const order = CONFIG.variants.map((_, i) => CONFIG.variants[(i + k) % CONFIG.variants.length]);
          k++;
          console.log(`${seq.id} (${seq.template}, ${seq.level}) run ${run}, variants in order ${order.join(", ")}`);
          records.push(...(await runSequence(seq, run, order)));
        }
    } catch (e) {
      if (!(e instanceof Stop)) {
        stopReason = `crashed: ${e.stack ?? e.message}`;
        finish();
        throw e;
      }
      stopReason = e.message;
      console.log(`STOPPED: ${e.message}`);
    }
    finish();
  } finally {
    await browser.close();
  }
}

await main();
