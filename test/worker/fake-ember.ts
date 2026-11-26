import { vi } from "vitest";

// A fake Muse Ember at the Worker's outbound fetch. Worker tests run in the same isolate as the
// Worker, so replacing globalThis.fetch intercepts its calls to the Responses API.
// Response shapes follow the recorded Ember calls (see limit-test recordings): each tool-mode
// response is [reasoning, message (commentary), function_call].

export const EMBER_URL = "https://api.meta.ai/v1/responses";

type OutputItem = Record<string, unknown>;
type FakeResponse = { status?: "completed" | "incomplete"; output: OutputItem[]; outputTokens?: number };

let callSeq = 0;

export function reasoning(): OutputItem {
  const n = ++callSeq;
  return {
    type: "reasoning",
    id: `rs_fake${n}:rs_${n}`,
    encrypted_content: `encrypted-${n}`,
    summary: [],
    status: "completed",
  };
}

export function commentary(text: string): OutputItem {
  return {
    type: "message",
    id: `rs_msg${++callSeq}`,
    role: "assistant",
    content: [{ type: "output_text", text, annotations: [], logprobs: [] }],
    phase: "commentary",
    status: "completed",
  };
}

export function textMessage(text: string): OutputItem {
  return {
    type: "message",
    id: `msg_${++callSeq}`,
    role: "assistant",
    content: [{ type: "output_text", text, annotations: [], logprobs: [] }],
    status: "completed",
  };
}

export function functionCall(name: string, args: unknown): OutputItem {
  const n = ++callSeq;
  return {
    type: "function_call",
    id: `fc_${n}`,
    call_id: `call_${n}`,
    name,
    arguments: JSON.stringify(args),
    status: "completed",
  };
}

/** A typical tool-mode response: reasoning, side commentary, then the tool call. */
export function toolCall(name: string, args: unknown): FakeResponse {
  return { output: [reasoning(), commentary(`Calling ${name} now.`), functionCall(name, args)] };
}

export function editCall(edits: { find: string; replace: string }[], summary: string): FakeResponse {
  return toolCall("edit_template", { edits, summary });
}

export function truncated(): FakeResponse {
  return { status: "incomplete", output: [reasoning()], outputTokens: 4000 };
}

function responseBody(r: FakeResponse) {
  const status = r.status ?? "completed";
  return {
    id: `resp_${++callSeq}`,
    object: "response",
    model: "muse-ember-1.0",
    status,
    incomplete_details: status === "incomplete" ? { reason: "max_output_tokens" } : null,
    error: null,
    output: r.output,
    usage: {
      input_tokens: 2000,
      input_tokens_details: { cached_tokens: 1900 },
      output_tokens: r.outputTokens ?? 500,
      output_tokens_details: { reasoning_tokens: 300 },
      total_tokens: 2000 + (r.outputTokens ?? 500),
    },
  };
}

export type EmberCall = { headers: Headers; body: any };

/**
 * Serves the given responses to successive Ember calls and records each request.
 * Fails loudly if the Worker calls Ember more often than scripted.
 */
export function fakeEmber(...responses: FakeResponse[]) {
  const calls: EmberCall[] = [];
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    if (request.url !== EMBER_URL) return realFetch(input, init);
    calls.push({ headers: request.headers, body: await request.json() });
    const next = responses[calls.length - 1];
    if (!next) throw new Error(`Unexpected Ember call #${calls.length}`);
    return Response.json(responseBody(next));
  });
  return calls;
}
