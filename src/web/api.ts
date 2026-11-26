import { SESSION_HEADER, type Status, type TurnRequest, type TurnResult } from "../core";
import { accessHeaders } from "./access/access-code";

// The browser's calls to the Worker.

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

/**
 * Sends one turn to Flint. A request the Worker refuses (400, 413) comes back as "too long"; any
 * other network or server failure as "resting". Never a throw.
 */
export async function postTurn(request: TurnRequest): Promise<TurnResult> {
  try {
    const res = await fetch("/api/turn", {
      method: "POST",
      headers: { "content-type": "application/json", [SESSION_HEADER]: sessionId, ...accessHeaders() },
      body: JSON.stringify(request),
    });
    if (res.status === 400 || res.status === 413) return { type: "error", error: "too_long" };
    if (!res.ok) return { type: "error", error: "resting" };
    return (await res.json()) as TurnResult;
  } catch {
    return { type: "error", error: "resting" };
  }
}

/** Live mode and access for this browser's code. A failure reads as undefined (the app then replays). */
export async function fetchStatus(): Promise<Status | undefined> {
  try {
    const res = await fetch("/api/status", { headers: accessHeaders() });
    return res.ok ? ((await res.json()) as Status) : undefined;
  } catch {
    return undefined;
  }
}
