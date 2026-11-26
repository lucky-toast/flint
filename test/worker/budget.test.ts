import { env, exports } from "cloudflare:workers";
import { reset } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GLOBAL_BUDGET } from "../../src/worker/budget";
import { postTurn } from "./client";
import { editCall, fakeEmber, toolCall } from "./fake-ember";

// The fake Ember reports 2000 input tokens (1900 cached) and 500 output tokens per call:
// 100 × $0.10/M + 1900 × $0.004/M + 500 × $0.50/M = $0.0002676 = 267,600 nano-dollars.
const FAKE_CALL_COST = 267_600;
const CAP = 3_000_000_000; // $3, the default TOKEN_BUDGET_USD
const usage = { inputTokens: 2000, cachedInputTokens: 1900, outputTokens: 500 };

const budget = (name = crypto.randomUUID()) => env.BUDGET.getByName(name);
const globalBudget = () => env.BUDGET.getByName(GLOBAL_BUDGET);

async function status() {
  return (await exports.default.fetch("http://flint.test/api/status")).json();
}

beforeEach(async () => {
  await reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("budget object", () => {
  it("holds a reservation until it's settled with the actual usage", async () => {
    const b = budget();

    const reservation = await b.reserve(5_000_000);
    expect(reservation.ok).toBe(true);
    expect(await b.snapshot()).toMatchObject({ capNanoUsd: CAP, spentNanoUsd: 0, reservedNanoUsd: 5_000_000 });

    await b.settle(reservation.ok ? reservation.id : "", usage);
    expect(await b.snapshot()).toMatchObject({ spentNanoUsd: FAKE_CALL_COST, reservedNanoUsd: 0 });
  });

  it("tracks cached input separately from uncached input and output", async () => {
    const b = budget();
    for (let i = 0; i < 2; i++) {
      const r = await b.reserve(1_000_000);
      await b.settle(r.ok ? r.id : "", usage);
    }

    expect(await b.snapshot()).toMatchObject({
      inputTokens: 4000,
      cachedInputTokens: 3800,
      outputTokens: 1000,
      spentNanoUsd: 2 * FAKE_CALL_COST,
    });
  });

  it("refuses a reservation that would pass the cap, counting other open reservations", async () => {
    const b = budget();
    const first = await b.reserve(CAP - 1_000_000);
    expect(first.ok).toBe(true);

    expect(await b.reserve(1_000_001)).toEqual({ ok: false });
    expect((await b.reserve(1_000_000)).ok).toBe(true);
    expect(await b.reserve(1)).toEqual({ ok: false });
  });

  it("charges the whole reservation when the call's usage is unknown", async () => {
    const b = budget();
    const r = await b.reserve(3_000_000);

    await b.settle(r.ok ? r.id : "", null);

    expect(await b.snapshot()).toMatchObject({ spentNanoUsd: 3_000_000, reservedNanoUsd: 0 });
  });

  it("ignores a second settle of the same reservation", async () => {
    const b = budget();
    const r = await b.reserve(3_000_000);
    const id = r.ok ? r.id : "";

    await b.settle(id, usage);
    await b.settle(id, usage);

    expect(await b.snapshot()).toMatchObject({ spentNanoUsd: FAKE_CALL_COST });
  });
});

describe("POST /api/turn, budget", () => {
  it("settles each attempt's actual usage and leaves nothing reserved", async () => {
    // A rejected edit, then a reply: two Ember calls.
    const calls = fakeEmber(editCall([{ find: "nowhere-in-the-template", replace: "x" }], "Hm"), toolCall("reply", { message: "Done 😊" }));

    expect(await (await postTurn({})).json()).toEqual({ type: "reply", message: "Done 😊" });

    expect(calls).toHaveLength(2);
    expect(await globalBudget().snapshot()).toMatchObject({
      spentNanoUsd: 2 * FAKE_CALL_COST,
      reservedNanoUsd: 0,
      inputTokens: 4000,
      cachedInputTokens: 3800,
      outputTokens: 1000,
    });
  });

  it("answers resting at the cap without calling Ember", async () => {
    await globalBudget().reserve(CAP - 1000);
    const calls = fakeEmber();

    expect(await (await postTurn({})).json()).toEqual({ type: "error", error: "resting" });
    expect(calls).toHaveLength(0);
  });

  it("charges the reservation when Ember fails", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("upstream down", { status: 503 }));

    expect(await (await postTurn({})).json()).toEqual({ type: "error", error: "resting" });

    const snapshot = await globalBudget().snapshot();
    expect(snapshot.reservedNanoUsd).toBe(0);
    expect(snapshot.spentNanoUsd).toBeGreaterThan(4000 * 500); // at least the output cap
  });
});

describe("GET /api/status, budget", () => {
  it("reports the remaining budget as a percentage of the cap", async () => {
    await globalBudget().reserve(CAP / 4);

    expect(await status()).toMatchObject({ live: true, budgetRemainingPct: 75 });
  });

  it("reports 0% once the budget is spent", async () => {
    await globalBudget().reserve(CAP);

    expect(await status()).toMatchObject({ budgetRemainingPct: 0 });
  });
});
