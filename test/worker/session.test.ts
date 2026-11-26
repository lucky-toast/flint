import { describe, expect, it } from "vitest";
import type { TurnResult } from "../../src/core";
import {
  canRedo,
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

/** A session with two answered edits: "v0" → "v1" → "v2". */
function twiceEditedSession() {
  return run(
    editedSession(),
    { type: "sent", message: "Make it v2" },
    { type: "replied", turnId: 2, result: edit("v2", "Now v2 🌈") },
  );
}

describe("session, Redo", () => {
  it("Undo twice then Redo twice restores the working slip and clears both Undone marks", () => {
    const undone = run(twiceEditedSession(), { type: "undid" }, { type: "undid" });
    expect(workingSource(undone)).toBe("v0");
    expect(canRedo(undone)).toBe(true);

    const state = run(undone, { type: "redid" }, { type: "redid" });

    expect(workingSource(state)).toBe("v2");
    expect(state.versions.map((v) => v.source)).toEqual(["v0", "v1", "v2"]);
    expect(state.turns.map((t) => t.undone)).toEqual([undefined, undefined]);
    expect(canRedo(state)).toBe(false);
    // Flint remembers the redone turns again.
    expect(historyForEmber(state)).toEqual([
      { user: "Make it v1", flint: "Now v1 ✨" },
      { user: "Make it v2", flint: "Now v2 🌈" },
    ]);
  });

  it("redoes the most recently undone version first", () => {
    const state = run(twiceEditedSession(), { type: "undid" }, { type: "undid" }, { type: "redid" });

    expect(workingSource(state)).toBe("v1");
    expect(state.turns.map((t) => !!t.undone)).toEqual([false, true]);
  });

  it("Undo, send, Redo does nothing: sending clears the Redo stack and the turn stays undone", () => {
    const sent = run(editedSession(), { type: "undid" }, { type: "sent", message: "Hello" });
    expect(canRedo(sent)).toBe(false);

    const state = run(sent, { type: "replied", turnId: 2, result: { type: "reply", message: "Hi 👋" } }, { type: "redid" });

    expect(workingSource(state)).toBe("v0");
    expect(state.turns[0]!.undone).toBe(true);
  });

  it("Undo, save, Redo still works", () => {
    const state = run(editedSession(), { type: "undid" }, { type: "saved" }, { type: "redid" });

    expect(state.original).toBe("v0");
    expect(workingSource(state)).toBe("v1");
    expect(state.turns[0]!.undone).toBeUndefined();
  });

  it("Redo restores Try again on the latest turn", () => {
    const undone = run(editedSession(), { type: "undid" });
    expect(retryableTurn(undone)).toBeUndefined();

    const state = run(undone, { type: "redid" });

    expect(retryableTurn(state)?.id).toBe(1);
  });
});
