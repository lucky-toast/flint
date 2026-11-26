import { exports } from "cloudflare:workers";
import { builtInTemplates } from "../../src/data";

// Helpers for calling the Worker's API the way the browser does.

export const classic = builtInTemplates.find((t) => t.id === "classic")!.source;

/** A random IP, so a test's requests don't share a rate-limit key with other tests. */
export function randomIp(): string {
  const n = crypto.getRandomValues(new Uint8Array(3));
  return `10.${n[0]}.${n[1]}.${n[2]}`;
}

/** A random session id, sent as the x-flint-session header. */
export function randomSession(): string {
  return crypto.randomUUID();
}

export type TurnOptions = { ip?: string; session?: string };

/** POST /api/turn with a valid body; `body` overrides its fields. */
export function postTurn(body: Record<string, unknown>, { ip = randomIp(), session }: TurnOptions = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", "cf-connecting-ip": ip };
  if (session) headers["x-flint-session"] = session;
  return exports.default.fetch("http://flint.test/api/turn", {
    method: "POST",
    headers,
    body: JSON.stringify({ shopId: "kiln-and-co", templateSource: classic, history: [], message: "Sort items", ...body }),
  });
}
