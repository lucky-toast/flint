import { exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { builtInTemplates } from "../../src/data";
import { turnHeaders } from "./client";
import { commentary, editCall, fakeEmber, reasoning, textMessage, toolCall, truncated } from "./fake-ember";

const classic = builtInTemplates.find((t) => t.id === "classic")!.source;
const SORT_FIND = `{% assign items = order.lineItems | sort: "title" %}`;
const SORT_REPLACE = `{% assign items = order.lineItems | sort: "sku" | sort: "quantity" %}`;
const sortEdit = () => editCall([{ find: SORT_FIND, replace: SORT_REPLACE }], "Sorted by quantity, then SKU 📦");
const sorted = classic.replace(SORT_FIND, SORT_REPLACE);

function turn(body: Record<string, unknown>) {
  return exports.default.fetch("http://flint.test/api/turn", {
    method: "POST",
    // A fresh IP per request keeps these tests clear of the per-IP rate limit.
    headers: turnHeaders(),
    body: JSON.stringify({ shopId: "kiln-and-co", templateSource: classic, history: [], ...body }),
  });
}

async function turnJson(body: Record<string, unknown>) {
  const res = await turn(body);
  expect(res.status).toBe(200);
  return res.json();
}

/** The function_call_output sent back after a rejected attempt. */
function feedback(call: { body: any }) {
  return call.body.input.filter((i: any) => i.type === "function_call_output").at(-1)?.output as string;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/turn, live edit", () => {
  it("returns an accepted edit with the new template and summary", async () => {
    const calls = fakeEmber(sortEdit());

    expect(await turnJson({ message: "Sort items by quantity, then SKU" })).toEqual({
      type: "edit",
      templateSource: sorted,
      summary: "Sorted by quantity, then SKU 📦",
    });
    expect(calls).toHaveLength(1);
  });

  it("calls Ember statelessly with the system prompt, all four tools and the turn in one user message", async () => {
    const calls = fakeEmber(sortEdit());

    await turnJson({
      message: "Sort items by quantity, then SKU",
      history: [{ user: "Make the logo bigger", flint: "Logo's bigger now 🎉" }],
    });

    const { headers, body } = calls[0]!;
    expect(headers.get("authorization")).toBe("Bearer test-ember-key");
    expect(body).toMatchObject({
      model: "muse-ember-1.0",
      store: false,
      include: ["reasoning.encrypted_content"],
      tool_choice: "auto",
      parallel_tool_calls: false,
      reasoning: { effort: "low" },
      max_output_tokens: 4000,
    });
    expect(body.previous_response_id).toBeUndefined();
    expect(body.tools.map((t: any) => [t.type, t.name])).toEqual([
      ["function", "edit_template"],
      ["function", "ask_clarification"],
      ["function", "request_asset"],
      ["function", "reply"],
    ]);
    // The system prompt carries the rules, the schema and this shop's asset names.
    expect(body.instructions).toContain("exactly one tool");
    expect(body.instructions).toContain("may be empty");
    expect(body.instructions).toContain("reversed");
    expect(body.instructions).toContain("assets.maker_mark");
    // The user message: working template, then the conversation, then the request.
    expect(body.input).toHaveLength(1);
    const content: string = body.input[0].content;
    expect(body.input[0].role).toBe("user");
    expect(content).toContain(SORT_FIND);
    expect(content.indexOf("Make the logo bigger")).toBeLessThan(content.indexOf("Request: Sort items by quantity"));
  });

  it("sends a rejected edit back with its error and returns the fixed edit from the retry", async () => {
    const calls = fakeEmber(
      editCall([{ find: SORT_FIND, replace: `{% assign items = order.lineItems | group: "sku" %}` }], "Grouped"),
      sortEdit(),
    );

    expect(await turnJson({ message: "Sort items by quantity, then SKU" })).toMatchObject({
      type: "edit",
      templateSource: sorted,
    });

    expect(calls).toHaveLength(2);
    const retry = calls[1]!.body;
    // Same stateless request, now with attempt 1's reasoning, commentary and call, then the error.
    expect(retry.instructions).toBe(calls[0]!.body.instructions);
    expect(retry.input.map((i: any) => i.type ?? i.role)).toEqual([
      "user",
      "reasoning",
      "assistant",
      "function_call",
      "function_call_output",
    ]);
    expect(retry.input[1]).toEqual({
      type: "reasoning",
      id: expect.any(String),
      summary: [],
      encrypted_content: expect.stringMatching(/^encrypted-/),
    });
    expect(retry.input[3]).toEqual({
      type: "function_call",
      call_id: expect.stringMatching(/^call_/),
      name: "edit_template",
      arguments: expect.any(String),
    });
    expect(retry.input[4].call_id).toBe(retry.input[3].call_id);
  });

  it("tells Ember the specific error, that the template is unchanged, and to call edit_template again", async () => {
    const calls = fakeEmber(
      editCall([{ find: SORT_FIND, replace: `{% assign items = order.lineItems | group: "sku" %}` }], "Grouped"),
      sortEdit(),
    );

    await turnJson({ message: "Sort items by quantity, then SKU" });

    const message = feedback(calls[1]!);
    expect(message).toMatch(/^Edit rejected: /);
    expect(message).toContain("undefined filter: group");
    expect(message).toContain("The template is unchanged");
    expect(message).toContain("call edit_template again");
  });

  it("rejects a find that matches nothing", async () => {
    const calls = fakeEmber(editCall([{ find: "<table class='items'>", replace: "<table>" }], "Hm"), sortEdit());

    expect(await turnJson({ message: "Sort items" })).toMatchObject({ type: "edit" });
    expect(feedback(calls[1]!)).toContain("edit 1: `find` text was not found in the template");
  });

  it("rejects a find that matches several places", async () => {
    const calls = fakeEmber(
      editCall(
        [
          { find: SORT_FIND, replace: SORT_REPLACE },
          { find: 'class="col-price"', replace: 'class="col-price hidden"' },
        ],
        "Hm",
      ),
      sortEdit(),
    );

    expect(await turnJson({ message: "Sort items" })).toMatchObject({ type: "edit", templateSource: sorted });
    expect(feedback(calls[1]!)).toContain("edit 2: `find` text matches 2 places; make it longer so it is unique");
  });

  it("rejects an edit that references an asset the shop doesn't have", async () => {
    const calls = fakeEmber(
      editCall([{ find: '<img class="logo"', replace: '<img src="{{ assets.eco_badge }}"><img class="logo"' }], "Badge"),
      toolCall("request_asset", { description: "Your eco-friendly badge image 🌱" }),
    );

    expect(await turnJson({ message: "Add my eco badge" })).toEqual({
      type: "asset",
      description: "Your eco-friendly badge image 🌱",
    });
    expect(feedback(calls[1]!)).toContain("eco_badge");
  });

  it("returns too_big on truncated output without retrying", async () => {
    const calls = fakeEmber(truncated());

    expect(await turnJson({ message: "Redo every part of the slip" })).toEqual({ type: "error", error: "too_big" });
    expect(calls).toHaveLength(1);
  });

  it("returns invalid after three rejected attempts, each with the previous attempts' feedback", async () => {
    const bad = () => editCall([{ find: "nowhere to be found", replace: "x" }], "Hm");
    const calls = fakeEmber(bad(), bad(), bad());

    expect(await turnJson({ message: "Sort items" })).toEqual({ type: "error", error: "invalid" });
    expect(calls).toHaveLength(3);
    expect(calls[2]!.body.input.filter((i: any) => i.type === "function_call_output")).toHaveLength(2);
  });

  it("nudges Ember to call edit_template when it answers a retry with text", async () => {
    const calls = fakeEmber(
      editCall([{ find: "nowhere to be found", replace: "x" }], "Hm"),
      { output: [reasoning(), textMessage("I miscounted, retrying with the fix.")] },
      sortEdit(),
    );

    expect(await turnJson({ message: "Sort items" })).toMatchObject({ type: "edit", templateSource: sorted });
    const last = calls[2]!.body.input.at(-1);
    expect(last.role).toBe("user");
    expect(last.content).toContain("Call edit_template");
  });

  it("never returns text from a retry as a reply, even when every retry is text", async () => {
    fakeEmber(
      editCall([{ find: "nowhere to be found", replace: "x" }], "Hm"),
      { output: [reasoning(), textMessage("Oops, let me fix that.")] },
      { output: [reasoning(), textMessage("Fixed it, I promise!")] },
    );

    expect(await turnJson({ message: "Sort items" })).toEqual({ type: "error", error: "invalid" });
  });
});

describe("POST /api/turn, other outcomes", () => {
  it("returns a clarifying question with its options", async () => {
    fakeEmber(toolCall("ask_clarification", { question: "What should change?", options: ["Bigger logo", "Bolder totals"] }));

    expect(await turnJson({ message: "Make it look nicer" })).toEqual({
      type: "ask",
      question: "What should change?",
      options: ["Bigger logo", "Bolder totals"],
    });
  });

  it("keeps at most four options on a clarifying question", async () => {
    fakeEmber(toolCall("ask_clarification", { question: "Which part?", options: ["Header", "Items", "Totals", "Footer", "Gift"] }));

    expect(await turnJson({ message: "Redesign everything" })).toMatchObject({
      type: "ask",
      options: ["Header", "Items", "Totals", "Footer"],
    });
  });

  it("returns a reply tool call", async () => {
    fakeEmber(toolCall("reply", { message: "I only do slips, but I can add a thank-you line! 😊" }));

    expect(await turnJson({ message: "What's the weather?" })).toEqual({
      type: "reply",
      message: "I only do slips, but I can add a thank-you line! 😊",
    });
  });

  it("returns plain text on the first attempt as a reply", async () => {
    fakeEmber({ output: [reasoning(), textMessage("Hi there! 👋")] });

    expect(await turnJson({ message: "hello" })).toEqual({ type: "reply", message: "Hi there! 👋" });
  });

  it("never shows Ember's commentary alongside a tool call", async () => {
    fakeEmber({
      output: [reasoning(), commentary("Internal: I'll ask first."), toolCall("reply", { message: "Sure! 😊" }).output[2]!],
    });

    expect(await turnJson({ message: "hello" })).toEqual({ type: "reply", message: "Sure! 😊" });
  });
});

describe("POST /api/turn, requests", () => {
  it("refuses a message over 500 characters", async () => {
    const res = await turn({ message: "x".repeat(501) });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "bad_request" });
  });

  it("refuses an unknown shop", async () => {
    const res = await turn({ shopId: "nope", message: "Sort items" });

    expect(res.status).toBe(400);
  });

  it("sends only the last 10 history turns to Ember", async () => {
    const calls = fakeEmber(sortEdit());
    const history = Array.from({ length: 12 }, (_, i) => ({ user: `request ${i + 1}.`, flint: `done ${i + 1}.` }));

    await turnJson({ message: "Sort items", history });

    const content: string = calls[0]!.body.input[0].content;
    expect(content).not.toContain("request 2.");
    expect(content).toContain("request 3.");
    expect(content).toContain("request 12.");
  });

  it("answers resting when Ember fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("upstream down", { status: 503 }));

    expect(await turnJson({ message: "Sort items" })).toEqual({ type: "error", error: "resting" });
  });

  it("answers resting when Ember sends a body that isn't JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("<html>gateway</html>", { status: 200 }));

    expect(await turnJson({ message: "Sort items" })).toEqual({ type: "error", error: "resting" });
  });
});
