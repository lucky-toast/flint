// The four tools Flint offers Muse Ember, declared in the flat Responses API function format.
// Their order and wording are stable so the request prefix caches.

export type Edit = { find: string; replace: string };

export type ToolName = "edit_template" | "ask_clarification" | "request_asset" | "reply";

export type FunctionTool = {
  type: "function";
  name: ToolName;
  description: string;
  parameters: Record<string, unknown>;
};

export const TOOLS: FunctionTool[] = [
  {
    type: "function",
    name: "edit_template",
    description:
      "Edit the current template with exact find/replace operations, applied in order. Each `find` must match the current template exactly once (copy it character for character, including whitespace).",
    parameters: {
      type: "object",
      properties: {
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
      },
      required: ["edits", "summary"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "ask_clarification",
    description:
      "Ask the seller a question when the request is vague, could mean very different things, or is too big for one edit (then suggest the steps as options).",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "One short, friendly question" },
        options: {
          type: "array",
          items: { type: "string" },
          description: "2-4 short suggested answers",
        },
      },
      required: ["question"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "request_asset",
    description: "Ask the seller to upload an image the request needs that isn't in the available assets.",
    parameters: {
      type: "object",
      properties: {
        description: { type: "string", description: "What image is needed, in one short friendly line" },
      },
      required: ["description"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "reply",
    description:
      "Reply briefly when the request is out of scope or small talk, offering the closest thing you can do in the template.",
    parameters: {
      type: "object",
      properties: { message: { type: "string", description: "One or two short, friendly lines" } },
      required: ["message"],
      additionalProperties: false,
    },
  },
];
