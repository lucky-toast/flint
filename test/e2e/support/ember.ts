import { test as base } from "@playwright/test";
import { fakeEmberURL } from "./ports";

// Scripting the fake Ember (./fake-ember-server.ts) from browser tests.
//
//   import { expect, test } from "./support/ember";
//   test("…", async ({ page, ember }) => {
//     await ember.onRequest("Make the order number red", editCall([{ find, replace }], "Made it red 🎉"));
//     …
//   });
//
// A script answers any turn whose request is the given message. Pass one response per attempt
// (the first, then retries after a rejected edit). Scripts are removed when the test ends.
// Parallel tests share one fake, so give each test its own message text, or script identical
// responses for a shared one. Response shapes follow the recorded Ember calls: a tool-mode
// response is [reasoning, commentary message, function_call].

export { expect } from "@playwright/test";

type OutputItem = Record<string, unknown>;
export type FakeResponse = { status?: "completed" | "incomplete"; output: OutputItem[]; outputTokens?: number };

let seq = 0;
const nextId = () => `${process.pid}_${++seq}`;

export function reasoning(): OutputItem {
  const n = nextId();
  return { type: "reasoning", id: `rs_${n}`, encrypted_content: `encrypted-${n}`, summary: [], status: "completed" };
}

/** Ember's side commentary beside a tool call. The app must never show it. */
export const COMMENTARY = "Internal note: calling the tool now.";

export function commentary(text = COMMENTARY): OutputItem {
  return {
    type: "message",
    id: `msg_${nextId()}`,
    role: "assistant",
    content: [{ type: "output_text", text, annotations: [], logprobs: [] }],
    phase: "commentary",
    status: "completed",
  };
}

export function textMessage(text: string): OutputItem {
  return {
    type: "message",
    id: `msg_${nextId()}`,
    role: "assistant",
    content: [{ type: "output_text", text, annotations: [], logprobs: [] }],
    status: "completed",
  };
}

export function functionCall(name: string, args: unknown): OutputItem {
  const n = nextId();
  return { type: "function_call", id: `fc_${n}`, call_id: `call_${n}`, name, arguments: JSON.stringify(args), status: "completed" };
}

/** A typical tool-mode response: reasoning, side commentary, then the tool call. */
export function toolCall(name: string, args: unknown): FakeResponse {
  return { output: [reasoning(), commentary(), functionCall(name, args)] };
}

export function editCall(edits: { find: string; replace: string }[], summary: string): FakeResponse {
  return toolCall("edit_template", { edits, summary });
}

export function askCall(question: string, options?: string[]): FakeResponse {
  return toolCall("ask_clarification", options ? { question, options } : { question });
}

export function assetCall(description: string): FakeResponse {
  return toolCall("request_asset", { description });
}

export function replyCall(message: string): FakeResponse {
  return toolCall("reply", { message });
}

/** Output cut off at the token cap: the Worker reports "too big". */
export function truncated(): FakeResponse {
  return { status: "incomplete", output: [reasoning()], outputTokens: 4000 };
}

/** Ember failing outright (e.g. an outage): the Worker reports "Flint is resting". */
export type HttpFailure = { httpStatus: number; body?: unknown };

export function emberDown(httpStatus = 503): HttpFailure {
  return { httpStatus, body: { error: { message: "fake Ember: service unavailable" } } };
}

/** The full Responses API body for a scripted response (failures pass through as they are). */
function responseBody(r: FakeResponse | HttpFailure) {
  if ("httpStatus" in r) return r;
  const status = r.status ?? "completed";
  const outputTokens = r.outputTokens ?? 500;
  return {
    id: `resp_${nextId()}`,
    object: "response",
    model: "muse-ember-1.0",
    status,
    incomplete_details: status === "incomplete" ? { reason: "max_output_tokens" } : null,
    error: null,
    output: r.output,
    usage: {
      input_tokens: 2000,
      input_tokens_details: { cached_tokens: 1900 },
      output_tokens: outputTokens,
      output_tokens_details: { reasoning_tokens: 300 },
      total_tokens: 2000 + outputTokens,
    },
  };
}

export type ScriptOptions = {
  /** Hold each response this long, e.g. to observe the thinking indicator. */
  delayMs?: number;
  /**
   * Match on any text in the turn's user message instead of the request line, e.g. a retry hint.
   * The longest matching script wins.
   */
  match?: string;
};

export type Script = {
  /** The Responses API request bodies this script has answered so far. */
  calls(): Promise<any[]>;
};

export class FakeEmber {
  private ids: string[] = [];

  /** Answers turns whose request is `message` with these responses, one per attempt. */
  async onRequest(message: string, ...responses: (FakeResponse | HttpFailure)[]): Promise<Script> {
    return this.script({}, message, ...responses);
  }

  async script(options: ScriptOptions, message: string, ...responses: (FakeResponse | HttpFailure)[]): Promise<Script> {
    const res = await fetch(`${fakeEmberURL}/__scripts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        match: options.match ?? `Request: ${message}`,
        responses: responses.map(responseBody),
        delayMs: options.delayMs,
      }),
    });
    if (!res.ok) throw new Error(`fake Ember refused the script: ${await res.text()}`);
    const { id } = (await res.json()) as { id: string };
    this.ids.push(id);
    return { calls: async () => (await fetch(`${fakeEmberURL}/__scripts/${id}/calls`)).json() };
  }

  async dispose() {
    await Promise.all(this.ids.map((id) => fetch(`${fakeEmberURL}/__scripts/${id}`, { method: "DELETE" })));
    this.ids = [];
  }
}

/** Playwright `test` with an `ember` fixture for scripting the fake Ember. */
export const test = base.extend<{ ember: FakeEmber }>({
  ember: async ({}, use) => {
    const ember = new FakeEmber();
    await use(ember);
    await ember.dispose();
  },
});
