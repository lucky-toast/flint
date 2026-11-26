import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../../src/worker";
import { classic, freshRateLimitWindow, postTurn, randomIp, randomSession, turnHeaders } from "./client";
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
    await freshRateLimitWindow();

    const results = await sendTurns(11, { ip });

    expect(results.slice(0, 10).every((r) => r.type === "reply")).toBe(true);
    expect(results[10]).toEqual(RESTING);
    expect(calls).toHaveLength(10);
  }, 15_000);

  it("counts each IP separately", async () => {
    fakeEmber(...Array.from({ length: 11 }, reply));
    const ip = randomIp();
    await freshRateLimitWindow();
    await sendTurns(10, { ip });

    expect(await (await postTurn({}, { ip: randomIp() })).json()).toMatchObject({ type: "reply" });
  }, 15_000);

  it("allows 50 messages per session in total, even across IPs, then rests", async () => {
    const calls = fakeEmber(...Array.from({ length: 50 }, reply));
    const session = randomSession();

    const results: any[] = [];
    for (let i = 0; i < 51; i++) results.push(await (await postTurn({}, { session, ip: randomIp() })).json());

    expect(results.slice(0, 50).every((r) => r.type === "reply")).toBe(true);
    expect(results[50]).toEqual(RESTING);
    expect(calls).toHaveLength(50);
  }, 30_000);

  it("counts each session separately", async () => {
    fakeEmber(...Array.from({ length: 51 }, reply));
    const session = randomSession();
    for (let i = 0; i < 50; i++) await postTurn({}, { session, ip: randomIp() });

    expect(await (await postTurn({}, { session: randomSession() })).json()).toMatchObject({ type: "reply" });
  }, 30_000);

  it("doesn't count a message the IP limit refused against the session's cap", async () => {
    fakeEmber(...Array.from({ length: 60 }, reply));
    const session = randomSession();
    for (let i = 0; i < 49; i++) await postTurn({}, { session, ip: randomIp() });
    const busyIp = randomIp();
    await freshRateLimitWindow();
    await sendTurns(10, { ip: busyIp });
    expect(await (await postTurn({}, { session, ip: busyIp })).json()).toEqual(RESTING);

    // The refused message didn't use up the 50th.
    expect(await (await postTurn({}, { session, ip: randomIp() })).json()).toMatchObject({ type: "reply" });
  }, 30_000);
});
