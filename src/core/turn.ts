import { withUploadedAssets } from "./assets";
import { applyEdits } from "./edits";
import {
  firstFunctionCall,
  messageText,
  replayItems,
  type EmberClient,
  type FunctionCallItem,
  type InputItem,
  type Usage,
} from "./ember";
import { buildInstructions, buildUserMessage, type TurnInput } from "./prompt";
import type { Shop } from "./schema";
import { TOOLS, type Edit } from "./tools";
import { validateTemplate } from "./validate";

// The turn loop: one seller message in, one outcome out. Edits are validated against every
// example order; a rejected edit goes back to Ember with the error (feedback-only retry).

/** What POST /api/turn takes. The access code (later) comes in a request header. */
export type TurnRequest = TurnInput & { shopId: string };

/** Seller messages are capped so requests stay focused. */
export const MAX_MESSAGE_LENGTH = 500;

/** `too_long`: the Worker refused the request itself as too long (HTTP 400/413); the browser reports it. */
export type TurnErrorCode = "too_big" | "invalid" | "resting" | "too_long";

/** What POST /api/turn returns. */
export type TurnResult =
  | { type: "edit"; templateSource: string; summary: string }
  | { type: "ask"; question: string; options: string[] }
  | { type: "asset"; description: string }
  | { type: "reply"; message: string }
  | { type: "error"; error: TurnErrorCode };

/** The first attempt plus at most two retries. */
export const MAX_ATTEMPTS = 3;

export const TEXT_ON_RETRY_NUDGE =
  "You replied with text but did not call edit_template, so nothing changed. Call edit_template now with the fix. Do not reply with text.";

export function editRejection(error: string): string {
  return `Edit rejected: ${error}. The template is unchanged. Fix the problem and call edit_template again.`;
}

export type RunTurnOptions = {
  ember: EmberClient;
  shop: Shop;
  input: TurnInput;
  /** Called with each attempt's actual usage, e.g. to settle the budget. */
  onUsage?: (usage: Usage) => void | Promise<void>;
};

export async function runTurn({ ember, shop: baseShop, input, onUsage }: RunTurnOptions): Promise<TurnResult> {
  // The system prompt stays fixed per shop so it caches; uploaded names go in the user message.
  const instructions = buildInstructions(baseShop);
  // Edits are validated with placeholder images under the uploaded names.
  const shop = withUploadedAssets(baseShop, input.uploadedAssets);
  const items: InputItem[] = [{ role: "user", content: buildUserMessage(input) }];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await ember.respond({ instructions, input: items, tools: TOOLS });
    await onUsage?.(response.usage);

    if (response.status === "incomplete") return { type: "error", error: "too_big" };

    const call = firstFunctionCall(response.output);
    if (!call) {
      const text = messageText(response.output).trim();
      if (attempt === 1 && text) return { type: "reply", message: text };
      items.push(...replayItems(response.output), { role: "user", content: TEXT_ON_RETRY_NUDGE });
      continue;
    }

    const outcome = await handleCall(call, shop, input.templateSource);
    if ("result" in outcome) return outcome.result;
    items.push(...replayItems(response.output), {
      type: "function_call_output",
      call_id: call.call_id,
      output: outcome.feedback,
    });
  }
  return { type: "error", error: "invalid" };
}

type CallOutcome = { result: TurnResult } | { feedback: string };

function parseArguments(call: FunctionCallItem): Record<string, unknown> | undefined {
  try {
    const args: unknown = JSON.parse(call.arguments);
    return args && typeof args === "object" && !Array.isArray(args) ? (args as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isEdit(value: unknown): value is Edit {
  return !!value && typeof value === "object" && isString((value as Edit).find) && isString((value as Edit).replace);
}

function toolRejection(name: string, error: string): string {
  return `${name} call rejected: ${error}. The template is unchanged. Call exactly one tool again with valid arguments.`;
}

async function handleCall(call: FunctionCallItem, shop: Shop, templateSource: string): Promise<CallOutcome> {
  const args = parseArguments(call);
  if (!args) {
    const error = "the arguments are not a valid JSON object";
    return { feedback: call.name === "edit_template" ? editRejection(error) : toolRejection(call.name, error) };
  }

  switch (call.name) {
    case "edit_template": {
      const { edits, summary } = args;
      if (!Array.isArray(edits) || !edits.every(isEdit) || !isString(summary)) {
        return {
          feedback: editRejection("the arguments must be { edits: { find: string, replace: string }[], summary: string }"),
        };
      }
      const applied = applyEdits(templateSource, edits);
      if (!applied.ok) return { feedback: editRejection(applied.error) };
      const valid = await validateTemplate(applied.source, shop);
      if (!valid.ok) return { feedback: editRejection(valid.error) };
      return { result: { type: "edit", templateSource: applied.source, summary } };
    }
    case "ask_clarification": {
      if (!isString(args.question)) return { feedback: toolRejection(call.name, "`question` must be a string") };
      const offered = Array.isArray(args.options) ? args.options.filter(isString).slice(0, 4) : [];
      // A choice needs 2-4 options; with fewer, it's shown as a plain question the seller answers in words.
      const options = offered.length >= 2 ? offered : [];
      return { result: { type: "ask", question: args.question, options } };
    }
    case "request_asset": {
      if (!isString(args.description)) return { feedback: toolRejection(call.name, "`description` must be a string") };
      return { result: { type: "asset", description: args.description } };
    }
    case "reply": {
      if (!isString(args.message)) return { feedback: toolRejection(call.name, "`message` must be a string") };
      return { result: { type: "reply", message: args.message } };
    }
    default:
      return {
        feedback: `Unknown tool ${call.name}. The template is unchanged. Call one of: ${TOOLS.map((t) => t.name).join(", ")}.`,
      };
  }
}
