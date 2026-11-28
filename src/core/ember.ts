import type { FunctionTool } from "./tools";

// A minimal client for Muse Ember's Responses API, used statelessly: nothing is stored server
// side, and encrypted reasoning is requested so it can be resent within a turn's retries.

export const EMBER_MODEL = "muse-ember-1.0";
export const DEFAULT_EMBER_BASE_URL = "https://api.meta.ai/v1";
export const MAX_OUTPUT_TOKENS = 4000;

// Input items, as sent back to Ember.
export type InputItem =
  | { role: "user"; content: string }
  | { role: "assistant"; content: { type: "output_text"; text: string }[] }
  | { type: "reasoning"; id: string; summary: unknown[]; encrypted_content: string }
  | { type: "function_call"; call_id: string; name: string; arguments: string }
  | { type: "function_call_output"; call_id: string; output: string };

// Output items, as Ember returns them (only the fields Flint reads).
export type ReasoningItem = { type: "reasoning"; id: string; summary?: unknown[]; encrypted_content?: string };
export type MessageItem = { type: "message"; role: "assistant"; content: { type: string; text?: string }[] };
export type FunctionCallItem = { type: "function_call"; call_id: string; name: string; arguments: string };
export type OutputItem = ReasoningItem | MessageItem | FunctionCallItem | { type: string };

export type Usage = { inputTokens: number; cachedInputTokens: number; outputTokens: number };

export type EmberResponse = {
  /** "incomplete" means the output was truncated (e.g. by max_output_tokens). */
  status: "completed" | "incomplete" | (string & {});
  output: OutputItem[];
  usage: Usage;
};

export type EmberRequest = {
  instructions: string;
  input: InputItem[];
  tools: FunctionTool[];
  /** Sent as prompt_cache_key: requests with the same key go to the same Ember server, so a shared prefix is more likely cached. */
  cacheKey?: string;
};

/**
 * One cache key per shop. Requests for a shop share its prefix (instructions and tools), and
 * Meta advises one stable key per shared prefix, not one per user or session (#43).
 */
export function promptCacheKey(shopId: string): string {
  return `flint-${shopId}`;
}

export type EmberClient = { respond(request: EmberRequest): Promise<EmberResponse> };

export class EmberError extends Error {
  constructor(
    message: string,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "EmberError";
  }
}

export type EmberClientOptions = {
  apiKey: string;
  baseUrl?: string;
  /** Defaults to the global fetch, looked up on each call. */
  fetch?: typeof fetch;
};

/** The full request body: stable content (instructions, tools) first so the prefix caches. */
export function requestBody({ instructions, input, tools, cacheKey }: EmberRequest) {
  return {
    model: EMBER_MODEL,
    ...(cacheKey ? { prompt_cache_key: cacheKey } : {}),
    instructions,
    tools,
    tool_choice: "auto",
    parallel_tool_calls: false,
    reasoning: { effort: "low" },
    max_output_tokens: MAX_OUTPUT_TOKENS,
    store: false,
    include: ["reasoning.encrypted_content"],
    input,
  };
}

export function createEmberClient({ apiKey, baseUrl = DEFAULT_EMBER_BASE_URL, fetch: fetchImpl }: EmberClientOptions): EmberClient {
  const url = `${baseUrl.replace(/\/+$/, "")}/responses`;
  return {
    async respond(request) {
      const doFetch = fetchImpl ?? globalThis.fetch;
      let res: Response;
      try {
        res = await doFetch(url, {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify(requestBody(request)),
        });
      } catch (err) {
        throw new EmberError(`Ember request failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (!res.ok) throw new EmberError(`Ember answered HTTP ${res.status}`, res.status);
      let body: {
        status?: string;
        output?: OutputItem[];
        usage?: {
          input_tokens?: number;
          input_tokens_details?: { cached_tokens?: number };
          output_tokens?: number;
        };
      };
      try {
        body = await res.json();
      } catch (err) {
        throw new EmberError(`Ember answered a body that isn't JSON: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (!body || typeof body !== "object") throw new EmberError("Ember answered a body that isn't a JSON object");
      return {
        status: body.status ?? "completed",
        output: Array.isArray(body.output) ? body.output : [],
        usage: {
          inputTokens: body.usage?.input_tokens ?? 0,
          cachedInputTokens: body.usage?.input_tokens_details?.cached_tokens ?? 0,
          outputTokens: body.usage?.output_tokens ?? 0,
        },
      };
    },
  };
}

/** Rewrites one attempt's output as input items to resend on a retry, in their original order. */
export function replayItems(output: OutputItem[]): InputItem[] {
  const items: InputItem[] = [];
  for (const item of output) {
    if (item.type === "reasoning") {
      const r = item as ReasoningItem;
      if (r.encrypted_content) {
        items.push({ type: "reasoning", id: r.id, summary: r.summary ?? [], encrypted_content: r.encrypted_content });
      }
    } else if (item.type === "message") {
      const text = messageText([item]);
      if (text) items.push({ role: "assistant", content: [{ type: "output_text", text }] });
    } else if (item.type === "function_call") {
      const f = item as FunctionCallItem;
      items.push({ type: "function_call", call_id: f.call_id, name: f.name, arguments: f.arguments });
    }
  }
  return items;
}

/** The text of the message items in an output. */
export function messageText(output: OutputItem[]): string {
  return output
    .filter((item): item is MessageItem => item.type === "message")
    .flatMap((m) => m.content)
    .filter((c) => c.type === "output_text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("");
}

export function firstFunctionCall(output: OutputItem[]): FunctionCallItem | undefined {
  return output.find((item): item is FunctionCallItem => item.type === "function_call");
}
