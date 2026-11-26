import { describe, expect, it } from "vitest";
import type { TurnResult } from "../../src/core";
import {
  canUndo,
  createSession,
  historyForEmber,
  retryableTurn,
  sessionReducer,
  workingSource,
  type Session,
  type SessionAction,
} from "../../src/web/session/session";

// The editor's session reducer (pure, so it runs here beside the Worker tests).

const run = (state: Session, ...actions: SessionAction[]) => actions.reduce(sessionReducer, state);
const edit = (templateSource: string, summary: string): TurnResult => ({ type: "edit", templateSource, summary });

/** A session with one answered edit: "v0" → "v1". */
function editedSession() {
  return run(createSession("v0"), { type: "sent", message: "Make it v1" }, { type: "replied", turnId: 1, result: edit("v1", "Now v1 ✨") });
}

describe("session, Try again", () => {
  it("restores the previous edit and reply when the retry fails, with the error as a note", () => {
    const state = run(
      editedSession(),
      { type: "retried", turnId: 1 },
      { type: "replied", turnId: 1, result: { type: "error", error: "resting" } },
    );

    expect(workingSource(state)).toBe("v1");
    expect(state.turns).toHaveLength(1);
    expect(state.turns[0]).toMatchObject({ result: edit("v1", "Now v1 ✨"), note: "resting" });
    expect(historyForEmber(state)).toEqual([{ user: "Make it v1", flint: "Now v1 ✨" }]);
    // The restored edit can still be undone or retried.
    expect(canUndo(state)).toBe(true);
    expect(retryableTurn(state)?.id).toBe(1);
  });

  it("replaces the edit when the retry succeeds, and clears an earlier failed retry's note", () => {
    const state = run(
      editedSession(),
      { type: "retried", turnId: 1 },
      { type: "replied", turnId: 1, result: { type: "error", error: "invalid" } },
      { type: "retried", turnId: 1 },
      { type: "replied", turnId: 1, result: edit("v1b", "Another way 🌟") },
    );

    expect(workingSource(state)).toBe("v1b");
    expect(state.versions.map((v) => v.source)).toEqual(["v0", "v1b"]);
    expect(state.turns[0]!.result).toEqual(edit("v1b", "Another way 🌟"));
    expect(state.turns[0]!.note).toBeUndefined();
  });

  it("keeps a failed first reply as the turn's error", () => {
    const state = run(createSession("v0"), { type: "sent", message: "Hi" }, { type: "replied", turnId: 1, result: { type: "error", error: "resting" } });

    expect(state.turns[0]!.result).toEqual({ type: "error", error: "resting" });
    expect(state.turns[0]!.note).toBeUndefined();
    expect(workingSource(state)).toBe("v0");
  });
});
