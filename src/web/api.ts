import type { TurnRequest, TurnResult } from "../core";

// The browser's calls to the Worker.

/** Sends one turn to Flint. A network or server failure comes back as "resting", never as a throw. */
export async function postTurn(request: TurnRequest): Promise<TurnResult> {
  try {
    const res = await fetch("/api/turn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!res.ok) return { type: "error", error: "resting" };
    return (await res.json()) as TurnResult;
  } catch {
    return { type: "error", error: "resting" };
  }
}
