import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../../src/worker";
import { LOG_PREFIX } from "../../src/worker/ember-log";
import { classic, TEST_ACCESS_CODE, turnHeaders, type TurnOptions } from "./client";
import { editCall, fakeEmber } from "./fake-ember";

// Local turn logging: with LOG_EMBER=on (set only by `npm start`), each Ember call and each turn is
// printed as one line in the limit test's calls.jsonl / runs.jsonl shapes.

const LOGO = '<img class="logo"';

async function turnWith(overrides: Partial<Env>, message: string, options: TurnOptions = {}) {
  const init = {
    method: "POST",
    headers: turnHeaders(options),
    body: JSON.stringify({ shopId: "kiln-and-co", templateSource: classic, history: [], message }),
  };
  return (await worker.fetch(new Request("http://flint.test/api/turn", init), { ...env, ...overrides })).json();
}

/** Captures console.log and returns the logged records. */
function captureLog() {
  const lines: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(" ")));
  return {
    lines,
    records: () =>
      lines.filter((l) => l.startsWith(LOG_PREFIX)).map((l) => JSON.parse(l.slice(LOG_PREFIX.length)) as { file: string; record: any }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("turn logging", () => {
  it("logs each Ember call and the turn when LOG_EMBER is on", async () => {
    fakeEmber(
      editCall([{ find: "not in the template", replace: "x" }], "Tried"),
      editCall([{ find: LOGO, replace: `${LOGO} style="height:96px"` }], "Bigger logo 🎉"),
    );
    const log = captureLog();

    const result = await turnWith({ LOG_EMBER: "on" }, "Make the logo bigger");

    expect(result).toMatchObject({ type: "edit", summary: "Bigger logo 🎉" });
    const calls = log.records().filter((r) => r.file === "calls.jsonl").map((r) => r.record);
    expect(calls.map((c) => c.attempt)).toEqual([1, 2]);
    expect(calls[0]).toMatchObject({
      api: "responses",
      mode: "tools",
      effort: "low",
      request: "Make the logo bigger",
      url: "https://api.meta.ai/v1/responses",
      httpStatus: 200,
      requestBody: { model: "muse-ember-1.0", store: true },
      response: { status: "completed" },
    });
    expect(calls[1].requestBody.input.at(-1).type).toBe("function_call_output");
    expect(typeof calls[0].latencyMs).toBe("number");

    const [run] = log.records().filter((r) => r.file === "runs.jsonl").map((r) => r.record);
    expect(run).toMatchObject({
      mode: "live",
      request: "Make the logo bigger",
      outcome: "edit",
      action: "edit_template",
      validOnAttempt: 2,
      summary: "Bigger logo 🎉",
      startTemplate: classic,
      linesTouched: { removed: 1, added: 1 },
    });
    expect(run.attempts).toHaveLength(2);
    expect(run.attempts[1]).toMatchObject({ finish: "completed", usage: { prompt: 2000, cached: 1900, completion: 500 } });
    expect(run.finalTemplate).toContain('style="height:96px"');
  });

  it("never logs the API key or the access code", async () => {
    fakeEmber(editCall([{ find: LOGO, replace: `${LOGO} data-x="1"` }], "Done"));
    const log = captureLog();

    await turnWith({ LOG_EMBER: "on" }, "Tag the logo");

    expect(log.records().length).toBeGreaterThan(0);
    const all = log.lines.join("\n");
    expect(all).not.toContain(env.EMBER_API_KEY!);
    expect(all).not.toContain(TEST_ACCESS_CODE);
  });

  it("logs replayed turns with their reason and no Ember calls", async () => {
    const calls = fakeEmber();
    const log = captureLog();

    await turnWith({ LOG_EMBER: "on" }, "Sort items by quantity, then SKU", { accessCode: null });

    expect(calls).toHaveLength(0);
    const records = log.records();
    expect(records.filter((r) => r.file === "calls.jsonl")).toHaveLength(0);
    expect(records.find((r) => r.file === "runs.jsonl")?.record).toMatchObject({
      mode: "replay",
      detail: "no_access_code",
      outcome: "edit",
    });
  });

  it("logs what the seller got when a turn is neither live nor replayed", async () => {
    fakeEmber();
    const log = captureLog();

    await turnWith({ LOG_EMBER: "on" }, "Add a QR code", { accessCode: null });

    expect(log.records().find((r) => r.file === "runs.jsonl")?.record).toMatchObject({
      mode: "not_live",
      detail: "no_access_code",
      outcome: "reply",
      attempts: [],
    });
  });

  it("logs nothing when LOG_EMBER isn't set, as in production", async () => {
    fakeEmber(editCall([{ find: LOGO, replace: `${LOGO} data-y="1"` }], "Done"));
    const log = captureLog();

    expect(await turnWith({}, "Tag the logo again")).toMatchObject({ type: "edit" });

    expect(log.records()).toHaveLength(0);
  });
});
