import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../../src/worker";
import { classic, postTurn, randomIp, randomSession, turnHeaders } from "./client";
import { fakeEmber, toolCall, type EmberCall } from "./fake-ember";

const reply = () => toolCall("reply", { message: "Hi 👋" });
const RESTING = { type: "error", error: "resting" };

async function sendTurns(count: number, options: { ip?: string; session?: string }) {
  const results: any[] = [];
  for (let i = 0; i < count; i++) results.push(await (await postTurn({}, options)).json());
  return results;
}

/** POST /api/turn against the Worker with some env values overridden. */
async function turnWith(overrides: Partial<Env>) {
  const init = {
    method: "POST",
    headers: turnHeaders(),
    body: JSON.stringify({ shopId: "kiln-and-co", templateSource: classic, history: [], message: "Sort items" }),
  };
  return (await worker.fetch(new Request("http://flint.test/api/turn", init), { ...env, ...overrides })).json();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/turn, kill switch", () => {
  it("answers resting without calling Ember when live mode is off", async () => {
    const calls: EmberCall[] = fakeEmber();

    expect(await turnWith({ LIVE_MODE: "off" })).toEqual(RESTING);
    expect(calls).toHaveLength(0);
  });

  it("answers resting without calling Ember when no key is configured", async () => {
    const calls = fakeEmber();

    expect(await turnWith({ EMBER_API_KEY: "" })).toEqual(RESTING);
    expect(calls).toHaveLength(0);
  });
});

describe("POST /api/turn, rate limits", () => {
  it("allows 10 messages a minute per IP, then rests", async () => {
    const calls = fakeEmber(...Array.from({ length: 10 }, reply));
    const ip = randomIp();

    const results = await sendTurns(11, { ip });

    expect(results.slice(0, 10).every((r) => r.type === "reply")).toBe(true);
    expect(results[10]).toEqual(RESTING);
    expect(calls).toHaveLength(10);
  });

  it("counts each IP separately", async () => {
    fakeEmber(...Array.from({ length: 11 }, reply));
    const ip = randomIp();
    await sendTurns(10, { ip });

    expect(await (await postTurn({}, { ip: randomIp() })).json()).toMatchObject({ type: "reply" });
  });

  it("allows 20 messages a minute per session, even across IPs, then rests", async () => {
    const calls = fakeEmber(...Array.from({ length: 20 }, reply));
    const session = randomSession();

    const results: any[] = [];
    for (let i = 0; i < 21; i++) results.push(await (await postTurn({}, { session, ip: randomIp() })).json());

    expect(results.slice(0, 20).every((r) => r.type === "reply")).toBe(true);
    expect(results[20]).toEqual(RESTING);
    expect(calls).toHaveLength(20);
  });
});
