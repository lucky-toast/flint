// The HTTP contract between the browser and the Worker, beside TurnRequest and TurnResult (turn.ts).

/** GET /api/status. `access`: whether the request carried a valid access code (without one, turns are replayed). */
export type Status = { live: boolean; access: boolean; budgetRemainingPct: number };

/** The browser sends a random per-tab session id in this header; the Worker caps live messages per session on it. */
export const SESSION_HEADER = "x-flint-session";

/** The judge's access code travels in this header. */
export const ACCESS_CODE_HEADER = "x-flint-access-code";
