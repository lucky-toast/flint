import { EMBER_MODEL, type Shop, type TurnInput, type TurnResult } from "../core";

// Local turn logging, in the same shapes as the limit test's results files:
//   calls.jsonl  one line per Ember call: exact request body, raw response (or error), HTTP status, latency
//   runs.jsonl   one line per turn: the request, each attempt's tool calls and usage, the outcome, and
//                the template before and after
// A Worker can't write files, so each record is printed as one console line starting with
// LOG_PREFIX. `npm start` (scripts/dev.mjs) turns logging on with LOG_EMBER=on and copies those
// lines into logs/<timestamp>/; `npm run review` builds review.html from them.
// Logging is off unless LOG_EMBER is "on", which only the local dev script sets. The API key travels
// in a request header and is never logged; the access code never reaches Ember.

export const LOG_PREFIX = "[flint-log] ";

export type LogFile = "calls.jsonl" | "runs.jsonl";

export function loggingOn(env: { LOG_EMBER?: string }): boolean {
  return env.LOG_EMBER === "on";
}

function emit(file: LogFile, record: Record<string, unknown>) {
  console.log(`${LOG_PREFIX}${JSON.stringify({ file, record })}`);
}

type Attempt = {
  latencyMs: number;
  finish?: string;
  usage?: { prompt: number; cached: number; completion: number };
  content?: string;
  toolCalls?: { name: string; arguments: string }[];
  error?: string;
};

/** One turn's log: a fetch for the Ember client that records each call, and `finish` for the turn. */
export type TurnLog = {
  fetch: typeof fetch;
  finish(result: TurnResult, mode: "live" | "replay" | "not_live", note?: string): void;
};

export function createTurnLog(shop: Shop, input: TurnInput): TurnLog {
  const turnId = crypto.randomUUID().slice(0, 8);
  const startedAt = new Date().toISOString();
  const attempts: Attempt[] = [];

  const loggedFetch: typeof fetch = async (url, init) => {
    const requestBody = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    const entry: Record<string, unknown> = {
      startedAt: new Date().toISOString(),
      api: "responses",
      mode: "tools",
      effort: requestBody?.reasoning?.effort,
      turn: turnId,
      shopId: shop.id,
      request: input.message,
      attempt: attempts.length + 1,
      url: String(url instanceof Request ? url.url : url),
      requestBody,
    };
    const attempt: Attempt = { latencyMs: 0 };
    attempts.push(attempt);
    const t0 = Date.now();
    try {
      const res = await fetch(url, init);
      const text = await res.clone().text();
      entry.httpStatus = res.status;
      entry.requestId = res.headers.get("x-request-id") ?? undefined;
      try {
        const data = JSON.parse(text);
        entry.response = data;
        Object.assign(attempt, summarize(data));
      } catch {
        entry.responseText = text;
      }
      if (!res.ok) attempt.error = `HTTP ${res.status}`;
      return res;
    } catch (err) {
      entry.error = attempt.error = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      entry.latencyMs = attempt.latencyMs = Date.now() - t0;
      emit("calls.jsonl", entry);
    }
  };

  return {
    fetch: loggedFetch,
    finish(result, mode, note) {
      const outcome = result.type === "error" ? result.error : result.type;
      emit("runs.jsonl", {
        startedAt,
        api: "responses",
        mode,
        model: EMBER_MODEL,
        turn: turnId,
        shopId: shop.id,
        request: input.message,
        retryHint: input.retryHint,
        historyTurns: input.history.length,
        uploadedAssets: input.uploadedAssets,
        attempts,
        outcome,
        detail: note,
        action: attempts.at(-1)?.toolCalls?.[0]?.name,
        validOnAttempt: result.type === "edit" && mode === "live" ? attempts.length : undefined,
        summary: result.type === "edit" ? result.summary : undefined,
        question: result.type === "ask" ? result.question : undefined,
        options: result.type === "ask" ? result.options : undefined,
        description: result.type === "asset" ? result.description : undefined,
        message: result.type === "reply" ? result.message : undefined,
        startTemplate: input.templateSource,
        finalTemplate: result.type === "edit" ? result.templateSource : undefined,
        linesTouched: result.type === "edit" ? linesTouched(input.templateSource, result.templateSource) : undefined,
      });
    },
  };
}

/** The parts of a Responses API body the review shows per attempt (as the limit test's runs.jsonl). */
function summarize(data: any): Partial<Attempt> {
  const output: any[] = Array.isArray(data?.output) ? data.output : [];
  const content = output
    .filter((o) => o.type === "message")
    .flatMap((m) => m.content ?? [])
    .map((c: any) => c.text ?? "")
    .join("");
  return {
    finish: data?.status,
    usage: {
      prompt: data?.usage?.input_tokens ?? 0,
      cached: data?.usage?.input_tokens_details?.cached_tokens ?? 0,
      completion: data?.usage?.output_tokens ?? 0,
    },
    content: content || undefined,
    toolCalls: output.filter((o) => o.type === "function_call").map((f) => ({ name: f.name, arguments: f.arguments })),
  };
}

/** Lines removed and added, counted as a multiset difference of lines. */
function linesTouched(before: string, after: string) {
  const counts = new Map<string, number>();
  for (const line of before.split("\n")) counts.set(line, (counts.get(line) ?? 0) + 1);
  let added = 0;
  for (const line of after.split("\n")) {
    const n = counts.get(line) ?? 0;
    if (n > 0) counts.set(line, n - 1);
    else added++;
  }
  const removed = [...counts.values()].reduce((a, b) => a + b, 0);
  return { removed, added };
}
