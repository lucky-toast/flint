#!/usr/bin/env node
// Muse Ember limit test for Flint.
//
// Runs the packing-slip change requests in fixtures.mjs against Muse Ember
// under two APIs (Chat Completions vs Responses), two edit strategies
// (targeted find/replace tool vs whole-file rewrite tool) and one or more
// reasoning efforts, then scores each run.
//
// Spend guardrails: a hard cap on API calls and a hard token budget. Before
// every call the script reserves the worst case (estimated input + output
// cap); if that would cross the budget, it stops. --dry-run prints an
// estimate and makes no calls. --mock exercises the pipeline offline.
//
// API key: put MODEL_API_KEY=... in limit-test/.env (gitignored; copy
// .env.example). The script loads it automatically.
//
// Usage:
//   node limit-test.mjs --dry-run
//   node limit-test.mjs
//   node limit-test.mjs --mock
//
// Options (defaults in brackets):
//   --runs=N            repetitions per request/api/mode/effort [5]
//   --apis=a,b          chat,responses [responses]  (the app uses responses)
//   --responses-state=s stateless (store:false + encrypted reasoning replay)
//                       or stored (previous_response_id) [stateless]
//   --modes=a,b         tools,rewrite [tools]  (the app uses tools)
//   --efforts=a,b       reasoning effort values [low]
//   --only=ids          comma-separated request ids (e.g. 3-sort,6-gift-prices)
//   --max-calls=N       hard cap on API calls, retries included [240]
//   --token-budget=N    hard cap on total tokens (input+output) [1200000]
//   --max-retries=N     validation retries per request [2]
//   --cap-tools=N       output cap in tools mode (max_completion_tokens /
//                       max_output_tokens; includes reasoning) [4000]
//   --cap-rewrite=N     output cap in rewrite mode [6000]
//   --model=ID          [muse-ember-1.0]
//   --dry-run  --mock
//   --print-request     print the exact request body(ies) and exit; no calls
//   --timeout-s=N       per-call HTTP timeout in seconds [180]
//
// Output (results/<timestamp>/), written as the run goes:
//   calls.jsonl   one line per API call: exact request body, raw response or
//                 error body, HTTP status, latency, context. Appended
//                 immediately after each call returns.
//   runs.jsonl    one line per scored run, appended as each finishes.
//   config.json   the settings used (no API key).
//   results.json + summary.md   written at the end, or on Ctrl-C / crash.

import { Liquid } from "liquidjs";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as F from "./fixtures.mjs";

// Load the API key from limit-test/.env (next to this script, wherever it's run from).
const ENV_PATH = fileURLToPath(new URL(".env", import.meta.url));
if (existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH);

// ---------------- config ----------------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  }),
);
const int = (v, d) => (v === undefined ? d : Number.parseInt(v, 10));

const CONFIG = {
  baseUrl: process.env.MODEL_API_BASE_URL ?? "https://api.meta.ai/v1",
  apiKey: process.env.MODEL_API_KEY,
  model: args.model ?? "muse-ember-1.0",
  runs: int(args.runs, 5),
  // Defaults match the app's chosen setup (full-run decision); pass both to compare.
  apis: String(args.apis ?? "responses").split(","),
  responsesState: String(args["responses-state"] ?? "stateless"),
  modes: String(args.modes ?? "tools").split(","),
  efforts: String(args.efforts ?? "low").split(","),
  only: args.only ? String(args.only).split(",") : null,
  maxCalls: int(args["max-calls"], 240),
  tokenBudget: int(args["token-budget"], 1_200_000),
  maxRetries: int(args["max-retries"], 2),
  cap: { tools: int(args["cap-tools"], 4000), rewrite: int(args["cap-rewrite"], 6000) },
  dryRun: !!args["dry-run"],
  printRequest: !!args["print-request"],
  timeoutMs: int(args["timeout-s"], 180) * 1000,
  mock: !!args.mock,
  // Official Muse Ember pricing (USD per 1M tokens), from Meta.
  price: { input: 0.1, cachedInput: 0.004, output: 0.5 },
  // Measured in the full run: used only for dry-run estimates.
  typicalCacheHit: 0.85,
  typicalOutput: { tools: 650, rewrite: 900 },
};

for (const m of CONFIG.modes) {
  if (!["tools", "rewrite"].includes(m)) die(`unknown mode: ${m}`);
}
for (const a of CONFIG.apis) {
  if (!["chat", "responses"].includes(a)) die(`unknown api: ${a}`);
}
if (!["stateless", "stored"].includes(CONFIG.responsesState)) die(`unknown --responses-state: ${CONFIG.responsesState}`);
if (!CONFIG.dryRun && !CONFIG.mock && !CONFIG.printRequest && !CONFIG.apiKey) die(`MODEL_API_KEY is not set. Put MODEL_API_KEY=your-key in ${ENV_PATH} (or use --dry-run / --mock)`);

function die(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

// ---------------- liquid ----------------
// Built-in Liquid only: no custom filters. (Multi-key sorts work by chaining
// the stable built-in `sort`, e.g. `sort: "sku" | reverse | sort: "quantity" | reverse`.)
const engine = new Liquid({ strictFilters: true, strictVariables: false });

async function renderAll(template) {
  const parsed = engine.parse(template); // throws on syntax errors
  const out = {};
  for (const [id, order] of Object.entries(F.orders)) {
    try {
      out[id] = await engine.render(parsed, { shop: F.shop, assets: F.assets, order });
    } catch (e) {
      throw new Error(`render failed for example order ${id}: ${e.message}`);
    }
  }
  return out;
}

// Missing and extra line items: compare how many times each item title appears
// in each example order before vs after the edit. Same method as the app's
// warning (Option A, §3.5). The app never rejects on this, since sellers may
// hide, combine or add items on purpose.
let originalRenders;
const countOf = (html, s) => html.split(s).length - 1;
async function itemChanges(renders) {
  originalRenders ??= await renderAll(F.classicTemplate);
  const missing = [], extra = [];
  for (const [id, order] of Object.entries(F.orders)) {
    for (const li of order.lineItems) {
      const before = countOf(originalRenders[id], li.title), after = countOf(renders[id], li.title);
      if (before > 0 && after === 0) missing.push(`${id}: ${li.title}`);
      else if (after > before) extra.push(`${id}: ${li.title} (${before}→${after})`);
    }
  }
  return { missing, extra };
}

// ---------------- prompts & tools ----------------
const fn = (name, description, properties, required) => ({
  type: "function",
  function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } },
});

const COMMON_TOOLS = [
  fn("ask_clarification", "Ask the user a short question when the request is vague or could mean several different things. Do not edit.",
    {
      question: { type: "string" },
      options: { type: "array", items: { type: "string" }, description: "2-4 short suggested answers" },
    }, ["question"]),
  fn("request_asset", "Ask the user to upload an image that the request needs but that is not in the available assets.",
    { description: { type: "string", description: "What image is needed" } }, ["description"]),
  fn("reply", "Send a short chat message without editing (out-of-scope requests, explanations).",
    { message: { type: "string" } }, ["message"]),
];

const EDIT_TOOLS = {
  tools: fn("edit_template",
    "Edit the current template with exact find/replace operations, applied in order. Each `find` must match the current template exactly once (copy it character for character, including whitespace).",
    {
      edits: {
        type: "array",
        items: {
          type: "object",
          properties: { find: { type: "string" }, replace: { type: "string" } },
          required: ["find", "replace"],
          additionalProperties: false,
        },
      },
      summary: { type: "string", description: "One short, friendly line describing the change" },
    }, ["edits", "summary"]),
  rewrite: fn("rewrite_template",
    "Replace the whole template with an updated version. Return the complete template, changing only what the request needs.",
    {
      template: { type: "string" },
      summary: { type: "string", description: "One short, friendly line describing the change" },
    }, ["template", "summary"]),
};

const toolsFor = (mode) => [EDIT_TOOLS[mode], ...COMMON_TOOLS];

const systemPrompt = (mode) => `You are Flint, a cheerful, brief helper that edits a seller's packing slip template.
The template is Liquid (LiquidJS) producing HTML. You only change this template; you cannot change orders, prices, shipping, or anything in the seller's shop.

Rules:
- Make the smallest change that does what the user asked. Do not restyle or reorganise anything else.
- Prefer the simplest change: chain filters rather than adding loops, and never hard-code numeric limits like (1..1000).
- Every line item must still appear on the slip unless the user asked to hide or combine items.
- If the request is vague or could mean very different things, call ask_clarification instead of guessing.
- If the request needs an image that is not in the available assets, call request_asset.
- If the request is out of scope, call reply and offer the closest thing you can do in the template.
- Every field below may be used; fields marked "empty" can be blank, so guard them with {% if %}.
- Always call exactly one tool.

Data available to the template:
${F.schemaDoc}

Available assets (use as {{ assets.<name> }}): ${Object.keys(F.assets).join(", ")}

Liquid note: ranges only count up, so (5..1) produces nothing. To count down, use (1..5) reversed.

${mode === "tools"
    ? "To edit, call edit_template with find/replace operations. Keep each `find` short but unique."
    : "To edit, call rewrite_template with the complete updated template."}`;

const userPrompt = (template, request) =>
  `Current template:\n\`\`\`liquid\n${template}\`\`\`\n\nRequest: ${request}`;

// ---------------- edit application ----------------
function applyEdit(mode, template, a) {
  if (mode === "rewrite") {
    if (typeof a.template !== "string" || !a.template.trim()) throw new Error("`template` is missing or empty");
    return a.template;
  }
  if (!Array.isArray(a.edits) || a.edits.length === 0) throw new Error("`edits` must be a non-empty array");
  let t = template;
  a.edits.forEach((e, i) => {
    if (typeof e?.find !== "string" || typeof e?.replace !== "string") throw new Error(`edit ${i + 1}: find/replace must be strings`);
    const count = e.find ? t.split(e.find).length - 1 : 0;
    if (count === 0) throw new Error(`edit ${i + 1}: \`find\` text was not found in the template: ${JSON.stringify(e.find.slice(0, 120))}`);
    if (count > 1) throw new Error(`edit ${i + 1}: \`find\` text matches ${count} places; make it longer so it is unique`);
    t = t.replace(e.find, () => e.replace);
  });
  return t;
}

function linesTouched(a, b) {
  const A = a.split("\n").map((l) => l.trim()).filter(Boolean);
  const B = b.split("\n").map((l) => l.trim()).filter(Boolean);
  const count = (arr) => arr.reduce((m, l) => m.set(l, (m.get(l) ?? 0) + 1), new Map());
  const ca = count(A), cb = count(B);
  let removed = 0, added = 0;
  for (const [l, n] of ca) removed += Math.max(0, n - (cb.get(l) ?? 0));
  for (const [l, n] of cb) added += Math.max(0, n - (ca.get(l) ?? 0));
  return { removed, added };
}

// ---------------- API adapters ----------------
// Each adapter builds request bodies for one Meta API and normalizes its
// responses, so the retry/scoring logic below is shared and the comparison fair.
//
//   chat       POST /chat/completions. Stateless; Ember's reasoning is NOT
//              carried into retries.
//   responses  POST /responses. Reasoning IS carried into retries, either
//              stateless (store:false + encrypted reasoning items resent; Meta's
//              recommended path, keeps no server copy) or stored
//              (previous_response_id). Choose with --responses-state.

const flatTools = (mode) => toolsFor(mode).map((t) => ({ type: "function", ...t.function }));

const APIS = {
  chat: {
    path: "/chat/completions",
    start: (mode, request) => ({
      messages: [
        { role: "system", content: systemPrompt(mode) },
        { role: "user", content: userPrompt(F.classicTemplate, request.text) },
      ],
    }),
    body: (conv, mode, effort) => ({
      model: CONFIG.model,
      messages: conv.messages,
      tools: toolsFor(mode),
      tool_choice: "auto",
      parallel_tool_calls: false,
      reasoning_effort: effort,
      max_completion_tokens: CONFIG.cap[mode],
    }),
    parse: (data) => {
      const choice = data.choices?.[0] ?? {};
      const msg = choice.message ?? {};
      const u = data.usage ?? {};
      return {
        calls: (msg.tool_calls ?? []).map((c) => ({ id: c.id, name: c.function?.name, arguments: c.function?.arguments })),
        text: msg.content ?? null,
        truncated: choice.finish_reason === "length",
        finish: choice.finish_reason,
        usage: { prompt: u.prompt_tokens, cached: u.prompt_tokens_details?.cached_tokens ?? 0, completion: u.completion_tokens, reasoning: u.completion_tokens_details?.reasoning_tokens ?? null },
      };
    },
    // results: tool outputs for this turn's calls; nudge: an extra user message
    // (used when Ember replied with text instead of calling the tool).
    addRetry: (conv, data, results, nudge) => {
      const msg = data.choices[0].message;
      conv.messages.push({ role: "assistant", content: msg.content ?? null, ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}) });
      for (const r of results) conv.messages.push({ role: "tool", tool_call_id: r.id, content: r.output });
      if (nudge) conv.messages.push({ role: "user", content: nudge });
      return { reasoningCarried: false };
    },
  },

  responses: {
    path: "/responses",
    start: (mode, request) => ({
      input: [{ role: "user", content: userPrompt(F.classicTemplate, request.text) }],
      previousId: null,
    }),
    body: (conv, mode, effort) => {
      const stateless = CONFIG.responsesState === "stateless";
      return {
        model: CONFIG.model,
        instructions: systemPrompt(mode), // does not carry across previous_response_id: always resent
        input: conv.input,
        tools: flatTools(mode),
        tool_choice: "auto",
        parallel_tool_calls: false,
        reasoning: { effort },
        max_output_tokens: CONFIG.cap[mode],
        store: !stateless,
        ...(stateless ? { include: ["reasoning.encrypted_content"] } : {}),
        ...(!stateless && conv.previousId ? { previous_response_id: conv.previousId } : {}),
      };
    },
    parse: (data) => {
      const out = data.output ?? [];
      const u = data.usage ?? {};
      return {
        calls: out.filter((o) => o.type === "function_call").map((o) => ({ id: o.call_id, name: o.name, arguments: o.arguments })),
        text: out.filter((o) => o.type === "message")
          .flatMap((o) => o.content ?? []).filter((c) => c.type === "output_text").map((c) => c.text).join("") || null,
        // Undocumented which field signals the output cap; treat any "incomplete" as truncated.
        truncated: data.status === "incomplete",
        finish: data.status + (data.incomplete_details ? ` (${JSON.stringify(data.incomplete_details)})` : ""),
        usage: { prompt: u.input_tokens, cached: u.input_tokens_details?.cached_tokens ?? 0, completion: u.output_tokens, reasoning: u.output_tokens_details?.reasoning_tokens ?? null },
      };
    },
    addRetry: (conv, data, results, nudge) => {
      const outputs = results.map((r) => ({ type: "function_call_output", call_id: r.id, output: r.output }));
      if (nudge) outputs.push({ role: "user", content: nudge });
      if (CONFIG.responsesState === "stored") {
        conv.previousId = data.id;
        conv.input = outputs; // server already holds the earlier turns
        return { reasoningCarried: true };
      }
      // Stateless: resend this turn's output items (reasoning with encrypted content,
      // function calls, any text) in their original order, then the tool results.
      let reasoningCarried = false;
      for (const o of data.output ?? []) {
        if (o.type === "reasoning") {
          if (!o.encrypted_content) continue; // can't replay without it (store:false)
          conv.input.push({ type: "reasoning", id: o.id, summary: o.summary ?? [], encrypted_content: o.encrypted_content });
          reasoningCarried = true;
        } else if (o.type === "function_call") {
          conv.input.push({ type: "function_call", call_id: o.call_id, name: o.name, arguments: o.arguments });
        } else if (o.type === "message") {
          conv.input.push({ role: "assistant", content: (o.content ?? []).filter((c) => c.type === "output_text").map((c) => ({ type: "output_text", text: c.text })) });
        }
      }
      conv.input.push(...outputs);
      return { reasoningCarried };
    },
  },
};

// ---------------- budget & HTTP ----------------
const state = { calls: 0, promptTokens: 0, cachedTokens: 0, completionTokens: 0, reasoningTokens: 0 };
// Real cost: uncached input + cached input (25x cheaper) + output.
const costUSD = (prompt, cached, completion) =>
  ((prompt - cached) * CONFIG.price.input + cached * CONFIG.price.cachedInput + completion * CONFIG.price.output) / 1e6;
const estTokens = (body) => Math.ceil(JSON.stringify(body).length / 3.2); // conservative chars->tokens

class BudgetStop extends Error {}
class ApiDisabled extends Error {}
const disabledApis = new Map(); // api -> reason (config/auth errors on a first attempt)

// ---------------- durable logging ----------------
// Everything is appended to disk as it happens, so a crash, Ctrl-C or sleep
// never loses data that was already paid for. The API key is never logged
// (it only travels in a header).
const LOG = { dir: null, inflight: null };
const logLine = (file, obj) => {
  if (LOG.dir) appendFileSync(`${LOG.dir}/${file}`, JSON.stringify(obj) + "\n");
};

async function callModel(api, mode, effort, conv, request, attempt, run) {
  const body = APIS[api].body(conv, mode, effort);
  const cap = CONFIG.cap[mode];
  if (state.calls >= CONFIG.maxCalls) throw new BudgetStop(`call cap reached (${CONFIG.maxCalls})`);
  const spent = state.promptTokens + state.completionTokens;
  const worst = estTokens(body) + cap;
  if (spent + worst > CONFIG.tokenBudget) {
    throw new BudgetStop(`token budget would be exceeded (spent ${spent}, next call worst case ${worst}, budget ${CONFIG.tokenBudget})`);
  }
  state.calls++;

  const entry = {
    seq: state.calls, startedAt: new Date().toISOString(), api, mode, effort, run, request: request.id, attempt: attempt + 1,
    url: `${CONFIG.baseUrl}${APIS[api].path}`, requestBody: body,
  };
  const t0 = Date.now();
  let data;
  LOG.inflight = entry;
  try {
    if (CONFIG.mock) {
      data = mockResponse(api, mode, request, attempt, body);
      entry.httpStatus = "mock";
      entry.response = data;
    } else {
      const res = await fetch(entry.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${CONFIG.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(CONFIG.timeoutMs),
      });
      const text = await res.text();
      entry.httpStatus = res.status;
      entry.requestId = res.headers.get("x-request-id") ?? undefined;
      try {
        entry.response = JSON.parse(text);
      } catch {
        entry.responseText = text; // non-JSON body (e.g. a gateway error page): keep it verbatim
      }
      if (!res.ok) {
        const msg = `HTTP ${res.status}: ${text.slice(0, 500)}`;
        // Config/auth problems on a first attempt will fail every call for this API: disable it.
        // (A 400 on a retry is recorded as that run's api_error, since it may be the retry shape.)
        if ([401, 403, 404].includes(res.status) || (res.status === 400 && attempt === 0)) throw new ApiDisabled(msg);
        throw new Error(msg);
      }
      if (entry.response === undefined) throw new Error(`response was not JSON: ${text.slice(0, 200)}`);
      data = entry.response;
    }
  } catch (e) {
    entry.error = e.message; // network errors and timeouts land here too; a timed-out call may still be billed
    throw e;
  } finally {
    LOG.inflight = null;
    entry.latencyMs = Date.now() - t0;
    logLine("calls.jsonl", entry);
  }

  const parsed = APIS[api].parse(data);
  parsed.usage.prompt ??= estTokens(body);
  parsed.usage.completion ??= cap; // unknown usage: assume the worst
  state.promptTokens += parsed.usage.prompt;
  state.cachedTokens += parsed.usage.cached ?? 0;
  state.completionTokens += parsed.usage.completion;
  state.reasoningTokens += parsed.usage.reasoning ?? 0;
  return { data, parsed };
}

// Offline stand-in. Request 1 fails validation on its first attempt so the retry
// path (and each API's retry message shape) is exercised.
function mockResponse(api, mode, request, attempt, body) {
  if (api === "responses" && attempt > 0) {
    // Check the retry input is shaped the way the docs require.
    const input = body.input;
    if (CONFIG.responsesState === "stored") {
      if (!body.previous_response_id || input.some((i) => i.type !== "function_call_output")) throw new Error("mock: bad stored retry shape");
    } else {
      const callIds = new Set(input.filter((i) => i.type === "function_call").map((i) => i.call_id));
      if (!input.filter((i) => i.type === "function_call_output").every((o) => callIds.has(o.call_id))) throw new Error("mock: output without matching call");
      const ri = input.findIndex((i) => i.type === "reasoning");
      const next = input[ri + 1];
      if (ri < 0 || !(next?.type === "function_call" || next?.role === "assistant")) throw new Error("mock: reasoning not followed by function_call or assistant message");
    }
  }
  const id = `call_${Math.random().toString(36).slice(2, 8)}`;
  let name, args;
  if (request.expect === "ask_clarification") [name, args] = ["ask_clarification", { question: "Nicer how?", options: ["Bigger logo", "Softer font"] }];
  else if (request.expect === "request_asset") [name, args] = ["request_asset", { description: "eco-friendly badge" }];
  else if (request.id === "1-logo-size" && attempt === 0 && mode === "tools") [name, args] = ["edit_template", { edits: [{ find: "NOT IN TEMPLATE", replace: "x" }], summary: "mock" }];
  else if (request.id === "1-logo-size" && mode === "tools") [name, args] = ["edit_template", { edits: [{ find: "height: 48px", replace: "height: 96px" }], summary: "mock" }];
  else if (mode === "tools") [name, args] = ["edit_template", { edits: [{ find: "Thank you for your order!", replace: "Thanks so much!" }], summary: "mock" }];
  else [name, args] = ["rewrite_template", { template: F.classicTemplate.replace("Thank you", "Thanks"), summary: "mock" }];
  const a = JSON.stringify(args);
  if (api === "chat") {
    return {
      choices: [{ finish_reason: "tool_calls", message: { role: "assistant", content: null, tool_calls: [{ id, type: "function", function: { name, arguments: a } }] } }],
      usage: { prompt_tokens: 2500, completion_tokens: 300, completion_tokens_details: { reasoning_tokens: 200 } },
    };
  }
  return {
    id: `resp_${Math.random().toString(36).slice(2, 8)}`,
    status: "completed",
    output: [
      { type: "reasoning", id: `rs_${id}`, summary: [], encrypted_content: CONFIG.responsesState === "stateless" ? "ENCRYPTED" : null },
      { type: "function_call", id: `fc_${id}`, call_id: id, name, arguments: a, status: "completed" },
    ],
    usage: { input_tokens: 2500, output_tokens: 300, output_tokens_details: { reasoning_tokens: 200 } },
  };
}

// ---------------- one scored run ----------------
async function runOne(api, mode, effort, request, run) {
  if (disabledApis.has(api)) throw new ApiDisabled(disabledApis.get(api));
  const original = F.classicTemplate;
  const conv = APIS[api].start(mode, request);
  const rec = { api, mode, effort, run, request: request.id, attempts: [], outcome: null, detail: "" };
  const editTool = EDIT_TOOLS[mode].function.name;

  for (let attempt = 0; attempt <= CONFIG.maxRetries; attempt++) {
    const t0 = Date.now();
    let res;
    try {
      res = await callModel(api, mode, effort, conv, request, attempt, run);
    } catch (e) {
      if (e instanceof BudgetStop || e instanceof ApiDisabled) throw e;
      rec.outcome = "api_error";
      rec.detail = e.message;
      return rec;
    }
    const p = res.parsed;
    rec.attempts.push({
      latencyMs: Date.now() - t0,
      finish: p.finish,
      usage: p.usage,
      content: p.text,
      toolCalls: p.calls.map((c) => ({ name: c.name, arguments: c.arguments })),
    });

    if (p.truncated) {
      rec.outcome = "truncated";
      rec.detail = `hit the output cap (reasoning counts toward it): ${p.finish}`;
      return rec;
    }

    const call = p.calls[0];
    if (!call && attempt > 0) {
      // Mid-retry, a text-only answer (e.g. "Retrying with the corrected count…") is
      // narration, not a reply for the seller: count it as a failed attempt and nudge.
      const error = "replied with text instead of calling the tool";
      rec.attempts.at(-1).error = error;
      const { reasoningCarried } = APIS[api].addRetry(conv, res.data, [],
        `You replied with text but did not call ${editTool}, so nothing changed. Call ${editTool} now with the fix. Do not reply with text.`);
      rec.attempts.at(-1).reasoningCarriedIntoRetry = reasoningCarried;
      continue;
    }
    if (!call) {
      // tool_choice can only be "auto": plain text is treated as a reply.
      rec.action = "text";
      rec.outcome = request.expect === "edit" ? "no_edit" : "wrong_action";
      rec.detail = String(p.text ?? "").slice(0, 200);
      return rec;
    }

    rec.action = call.name;
    if (call.name !== editTool) {
      if (request.expect === call.name) rec.outcome = "pass";
      else rec.outcome = request.expect === "edit" ? "no_edit" : "wrong_action";
      rec.detail = call.arguments?.slice(0, 200) ?? "";
      return rec;
    }
    if (request.expect !== "edit") {
      rec.outcome = "wrong_action";
      rec.detail = "edited instead of " + request.expect;
      return rec;
    }

    let error = null;
    try {
      const a = JSON.parse(call.arguments);
      const updated = applyEdit(mode, original, a);
      const renders = await renderAll(updated);
      const [ok, detail] = request.check(renders);
      const { missing, extra } = await itemChanges(renders);
      rec.itemsMissing = missing;
      rec.itemsExtra = extra;
      // None of the test requests ask to hide, combine or repeat existing items, so
      // missing or extra items are a wrong result here (in the app they're only a
      // warning; §3.5). Not retried, since the app wouldn't retry either. A request
      // can opt out with allowsItemChanges.
      const itemNotes = [];
      if (!request.allowsItemChanges) {
        if (missing.length) itemNotes.push(`${missing.length} item(s) missing (${missing.slice(0, 3).join("; ")}${missing.length > 3 ? "; …" : ""})`);
        if (extra.length) itemNotes.push(`extra items (${extra.slice(0, 3).join("; ")}${extra.length > 3 ? "; …" : ""})`);
      }
      rec.outcome = ok && !itemNotes.length ? "pass" : "check_fail";
      rec.detail = itemNotes.length ? `${itemNotes.join(" | ")}${ok ? "" : ` | ${detail}`}` : detail;
      rec.validOnAttempt = attempt + 1;
      rec.summary = a.summary;
      rec.linesTouched = linesTouched(original, updated);
      rec.finalTemplate = updated;
      return rec;
    } catch (e) {
      error = e.message;
    }

    // Feed the error back and retry (the template is unchanged).
    rec.attempts.at(-1).error = error;
    const { reasoningCarried } = APIS[api].addRetry(conv, res.data, p.calls.map((c) => ({
      id: c.id,
      output: c === call
        ? `Edit rejected: ${error}. The template is unchanged. Call ${editTool} again with the fix. Do not reply with text.`
        : "Ignored: call only one tool per turn.",
    })));
    rec.attempts.at(-1).reasoningCarriedIntoRetry = reasoningCarried;
  }

  rec.outcome = "invalid";
  rec.detail = rec.attempts.at(-1)?.error ?? "";
  return rec;
}

// ---------------- plan, dry run, main loop ----------------
const requests = F.requests.filter((r) => !CONFIG.only || CONFIG.only.includes(r.id));
const plan = [];
for (let run = 1; run <= CONFIG.runs; run++)
  for (const api of CONFIG.apis)
    for (const mode of CONFIG.modes)
      for (const effort of CONFIG.efforts)
        for (const request of requests) plan.push({ run, api, mode, effort, request });

const firstBody = (p) => APIS[p.api].body(APIS[p.api].start(p.mode, p.request), p.mode, p.effort);

function estimate() {
  let input = 0, worstOut = 0, typicalOut = 0;
  for (const p of plan) {
    input += estTokens(firstBody(p));
    worstOut += CONFIG.cap[p.mode];
    typicalOut += CONFIG.typicalOutput[p.mode];
  }
  return {
    calls: plan.length, input, worstOut, typicalOut,
    typicalCost: costUSD(input, input * CONFIG.typicalCacheHit, typicalOut).toFixed(3), // measured cache hit
    worstCost: costUSD(input, 0, worstOut).toFixed(3),                                   // no cache, every call at the cap
  };
}

const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : "-");
const avg = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : "-");

function summarize(results) {
  const row = (label, rs) => {
    const n = rs.length;
    const c = (o) => rs.filter((r) => r.outcome === o).length;
    const atts = rs.flatMap((r) => r.attempts);
    const edits = rs.filter((r) => r.action?.endsWith("_template"));
    const retried = edits.filter((r) => r.attempts.length > 1);
    const retryWins = retried.filter((r) => r.validOnAttempt > 1).length;
    const retryAtts = rs.flatMap((r) => r.attempts.slice(1));
    return `| ${label} | ${n} | ${pct(c("pass"), n)} | ${pct(edits.filter((r) => r.validOnAttempt === 1).length, edits.length)} | ${retried.length ? `${retryWins}/${retried.length}` : "-"} | ${c("check_fail")} | ${c("invalid")} | ${c("truncated")} | ${c("no_edit") + c("wrong_action")} | ${c("api_error")} | ${edits.filter((r) => r.itemsMissing?.length || r.itemsExtra?.length).length} | ${avg(atts.map((a) => a.usage.completion))} | ${avg(atts.map((a) => a.usage.reasoning ?? 0))} | ${avg(retryAtts.map((a) => a.usage.completion))} | ${avg(atts.map((a) => a.latencyMs))} |`;
  };
  const groups = new Map();
  for (const r of results) {
    const k = `${r.api} / ${r.mode} / ${r.effort} / ${r.request}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const lines = [
    "| api / mode / effort / request | n | pass | valid 1st try | fixed by retry | check fail | invalid | truncated | wrong/no action | api err | missing/extra items | avg out tok | avg reasoning tok | avg out tok on retries | avg ms |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const [k, rs] of groups) lines.push(row(k, rs));
  for (const api of CONFIG.apis)
    for (const mode of CONFIG.modes)
      for (const effort of CONFIG.efforts) {
        const rs = results.filter((r) => r.api === api && r.mode === mode && r.effort === effort);
        if (rs.length) lines.push(row(`**${api} / ${mode} / ${effort} / ALL**`, rs));
      }
  return lines.join("\n");
}

async function main() {
  const est = estimate();
  console.log(`Planned: ${est.calls} first-attempt calls (+ up to ${CONFIG.maxRetries} retries each on invalid edits)`);
  console.log(`APIs: ${CONFIG.apis.join(", ")}${CONFIG.apis.includes("responses") ? ` (responses state: ${CONFIG.responsesState})` : ""}`);
  console.log(`Estimated input tokens: ~${est.input.toLocaleString()} | output: typical ~${est.typicalOut.toLocaleString()}, worst ${est.worstOut.toLocaleString()}`);
  console.log(`Estimated cost: typical ~$${est.typicalCost} (~${Math.round(CONFIG.typicalCacheHit * 100)}% cache hit), worst case ~$${est.worstCost} (no cache, every call at the cap; before retries)`);
  console.log(`Hard limits: ${CONFIG.maxCalls} calls, ${CONFIG.tokenBudget.toLocaleString()} tokens. The run stops before crossing either.`);
  if (CONFIG.printRequest) {
    // Print the exact first-attempt body for each planned api/mode/effort/request, then exit. No calls.
    const seen = new Set();
    for (const p of plan) {
      const k = `${p.api}|${p.mode}|${p.effort}|${p.request.id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      console.log(`\n===== ${k} =====`);
      console.log(JSON.stringify(firstBody(p), null, 2));
    }
    return;
  }
  if (CONFIG.dryRun) return;

  // Sanity-check the base template renders before spending anything.
  await renderAll(F.classicTemplate);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  LOG.dir = `results/${stamp}`;
  mkdirSync(LOG.dir, { recursive: true });
  writeFileSync(`${LOG.dir}/config.json`, JSON.stringify({ ...CONFIG, apiKey: undefined, startedAt: new Date().toISOString() }, null, 2));
  console.log(`Logging every call to ${LOG.dir}/calls.jsonl and every scored run to ${LOG.dir}/runs.jsonl`);

  const results = [];
  let stopReason = null;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    const summary = summarize(results);
    const disabled = [...disabledApis].map(([a, why]) => `\nDisabled ${a}: ${why}`).join("");
    const hit = state.promptTokens ? Math.round((100 * state.cachedTokens) / state.promptTokens) : 0;
    const totals = `Calls: ${state.calls} | input tokens: ${state.promptTokens.toLocaleString()} (cached ${state.cachedTokens.toLocaleString()}, ${hit}% hit) | output tokens: ${state.completionTokens.toLocaleString()} (reasoning ${state.reasoningTokens.toLocaleString()}) | cost ~$${costUSD(state.promptTokens, state.cachedTokens, state.completionTokens).toFixed(4)}${stopReason ? `\nStopped early: ${stopReason}` : ""}${disabled}`;
    writeFileSync(`${LOG.dir}/results.json`, JSON.stringify({ config: { ...CONFIG, apiKey: undefined }, totals: state, stopReason, disabledApis: Object.fromEntries(disabledApis), results }, null, 2));
    writeFileSync(`${LOG.dir}/summary.md`, `${summary}\n\n${totals}\n`);
    console.log(`\n${summary}\n\n${totals}`);
    console.log(`\nSaved in ${LOG.dir}/: calls.jsonl (every raw request/response), runs.jsonl, results.json, summary.md`);
    console.log("Paste summary.md back into the planning chat.");
  };
  // Ctrl-C or a crash still writes the summary for whatever finished; calls.jsonl is already on disk.
  process.once("SIGINT", () => {
    stopReason = "interrupted (Ctrl-C)";
    if (LOG.inflight) {
      // The request was sent but no response arrived; it may still be billed.
      logLine("calls.jsonl", { ...LOG.inflight, error: "interrupted before the response arrived (may still be billed)" });
    }
    console.log("\nInterrupted: writing results so far…");
    finish();
    process.exit(130);
  });
  process.once("uncaughtException", (e) => {
    stopReason = `crashed: ${e.message}`;
    console.error(e);
    finish();
    process.exit(1);
  });

  for (const [i, p] of plan.entries()) {
    if (disabledApis.has(p.api)) continue;
    try {
      const r = await runOne(p.api, p.mode, p.effort, p.request, p.run);
      results.push(r);
      logLine("runs.jsonl", r);
      const tok = state.promptTokens + state.completionTokens;
      console.log(`[${i + 1}/${plan.length}] ${p.api}/${p.mode}/${p.effort} ${p.request.id} run ${p.run}: ${r.outcome}${r.detail ? ` (${r.detail.slice(0, 90)})` : ""}  [calls ${state.calls}, tokens ${tok.toLocaleString()}]`);
    } catch (e) {
      if (e instanceof ApiDisabled) {
        disabledApis.set(p.api, e.message);
        console.log(`DISABLED ${p.api} for the rest of the run: ${e.message}`);
        continue;
      }
      stopReason = e.message;
      console.log(`STOPPED: ${e.message}`);
      break;
    }
  }
  finish();
}

main().catch((e) => die(e.stack ?? e.message));
