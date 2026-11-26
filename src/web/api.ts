import type { TurnRequest, TurnResult } from "../core";

// The browser's calls to the Worker.

/** Must match SESSION_HEADER in src/worker/rate-limits.ts: the Worker rate-limits per session on it. */
const SESSION_HEADER = "x-flint-session";
const SESSION_KEY = "flint-session";

/** A random id per browser tab, kept across reloads of that tab when sessionStorage is available. */
function tabSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

const sessionId = tabSessionId();

/** Sends one turn to Flint. A network or server failure comes back as "resting", never as a throw. */
export async function postTurn(request: TurnRequest): Promise<TurnResult> {
  try {
    const res = await fetch("/api/turn", {
      method: "POST",
      headers: { "content-type": "application/json", [SESSION_HEADER]: sessionId },
      body: JSON.stringify(request),
    });
    if (!res.ok) return { type: "error", error: "resting" };
    return (await res.json()) as TurnResult;
  } catch {
    return { type: "error", error: "resting" };
  }
}
