import { exports } from "cloudflare:workers";
import { builtInTemplates } from "../../src/data";
import { ACCESS_CODE_HEADER } from "../../src/core";

// Helpers for calling the Worker's API the way the browser does.

export const classic = builtInTemplates.find((t) => t.id === "classic")!.source;

/** The access code configured for Worker tests (vitest.config.ts). */
export const TEST_ACCESS_CODE = "test-access-code";

/** A random IP, so a test's requests don't share a rate-limit key with other tests. */
export function randomIp(): string {
  const n = crypto.getRandomValues(new Uint8Array(3));
  return `10.${n[0]}.${n[1]}.${n[2]}`;
}

/**
 * Waits until the current rate-limit window has at least `marginMs` left. The binding's windows
 * are aligned to the wall clock, so a burst that straddles a minute boundary would see its counts
 * reset part-way through. Call this before a test that counts requests against a limit.
 */
export async function freshRateLimitWindow(marginMs = 5_000, periodMs = 60_000): Promise<void> {
  const left = periodMs - (Date.now() % periodMs);
  if (left < marginMs) await new Promise((resolve) => setTimeout(resolve, left + 50));
}

/** A random session id, sent as the x-flint-session header. */
export function randomSession(): string {
  return crypto.randomUUID();
}

/**
 * `accessCode` defaults to the valid test code, so turns run live against the fake Ember;
 * pass null to send none (replay mode).
 */
export type TurnOptions = { ip?: string; session?: string; accessCode?: string | null };

/** The headers the browser sends with a turn. */
export function turnHeaders({ ip = randomIp(), session, accessCode = TEST_ACCESS_CODE }: TurnOptions = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", "cf-connecting-ip": ip };
  if (session) headers["x-flint-session"] = session;
  if (accessCode !== null) headers[ACCESS_CODE_HEADER] = accessCode;
  return headers;
}

/** POST /api/turn with a valid body; `body` overrides its fields. */
export function postTurn(body: Record<string, unknown>, options: TurnOptions = {}) {
  return exports.default.fetch("http://flint.test/api/turn", {
    method: "POST",
    headers: turnHeaders(options),
    body: JSON.stringify({ shopId: "kiln-and-co", templateSource: classic, history: [], message: "Sort items", ...body }),
  });
}
