import { HISTORY_LIMIT, type HistoryTurn, type TurnErrorCode, type TurnResult } from "../../core";
import { flintText } from "./flint-text";

// The editor's client state for one shop + template: the version stack and the chat, as turns.
// Pure data and a reducer, so features (undo, try again, uploads, chips…) add actions here and
// components only read selectors. Nothing here talks to the network; see useSession.ts.

/**
 * What the seller pointed at when sending a turn: the part's name for the chat tag, and the note
 * Flint is told (its name and template code), kept for the history and Try again.
 */
export type TurnSelection = { name: string; note: string };

/** One exchange: what the seller sent and, once it arrives, Flint's outcome. */
export type Turn = {
  id: number;
  message: string;
  /** The selection the message was sent with, if any. */
  selection?: TurnSelection;
  /** Undefined while Flint is thinking. */
  result?: TurnResult;
  /** Undone turns stay in the chat (marked) but are dropped from the history sent to Ember. */
  undone?: boolean;
  /** While Try again is pending: the edit and reply it replaces, restored if the retry fails. */
  retrying?: { result: TurnResult; version: Version };
  /** A failed Try again: the edit was kept, and Flint says why the retry didn't work. */
  note?: TurnErrorCode;
};

/** A template source on the stack and the turn whose edit produced it (null for the starting point). */
export type Version = { source: string; turnId: number | null };

export type Session = {
  /** What the working slip is compared against: the template as opened (or as last saved). */
  original: string;
  /** Never empty: versions[0] is the original, the last one is the working slip. */
  versions: Version[];
  turns: Turn[];
  nextTurnId: number;
  /** The Redo stack: versions Undo removed, most recently undone last. Sending any message empties it. */
  redo: Version[];
};

export type SessionAction =
  | { type: "sent"; message: string; selection?: TurnSelection }
  | { type: "replied"; turnId: number; result: TurnResult }
  /** Steps the working slip back one version and marks that edit's turn undone. */
  | { type: "undid" }
  /** Puts the most recently undone version back on the working slip and un-marks its turn. */
  | { type: "redid" }
  /**
   * Try again: sets the turn's edit and reply aside, so the turn waits for Flint's new reply. If
   * that reply is an error, the edit and reply come back and the error shows as a note.
   */
  | { type: "retried"; turnId: number }
  /** The working slip was saved: it becomes the original that later edits compare against. */
  | { type: "saved" };

/** A turn as the seller sent it, without Flint's outcome. */
function sent({ id, message, selection }: Turn): Turn {
  return selection ? { id, message, selection } : { id, message };
}

export function createSession(source: string): Session {
  return { original: source, versions: [{ source, turnId: null }], turns: [], nextTurnId: 1, redo: [] };
}

export function sessionReducer(state: Session, action: SessionAction): Session {
  switch (action.type) {
    case "sent": {
      const turn: Turn = {
        id: state.nextTurnId,
        message: action.message,
        ...(action.selection ? { selection: action.selection } : {}),
      };
      // Any message clears Redo: the turns on the stack stay undone for good.
      return { ...state, turns: [...state.turns, turn], nextTurnId: state.nextTurnId + 1, redo: [] };
    }
    case "replied": {
      const { turnId, result } = action;
      const retried = state.turns.find((t) => t.id === turnId)?.retrying;
      if (retried && result.type === "error") {
        const turns = state.turns.map((t) =>
          t.id === turnId ? { ...sent(t), result: retried.result, note: result.error } : t,
        );
        return { ...state, turns, versions: [...state.versions, retried.version] };
      }
      const turns = state.turns.map((t) => (t.id === turnId ? { ...sent(t), result } : t));
      const versions =
        result.type === "edit" ? [...state.versions, { source: result.templateSource, turnId }] : state.versions;
      return { ...state, turns, versions };
    }
    case "undid": {
      if (!canUndo(state)) return state;
      const removed = state.versions[state.versions.length - 1]!;
      const turns = state.turns.map((t) => (t.id === removed.turnId ? { ...t, undone: true } : t));
      return { ...state, turns, versions: state.versions.slice(0, -1), redo: [...state.redo, removed] };
    }
    case "redid": {
      if (!canRedo(state)) return state;
      const restored = state.redo[state.redo.length - 1]!;
      const turns = state.turns.map((t) => {
        if (t.id !== restored.turnId) return t;
        const { undone: _undone, ...rest } = t;
        return rest;
      });
      return { ...state, turns, versions: [...state.versions, restored], redo: state.redo.slice(0, -1) };
    }
    case "retried": {
      const turn = retryableTurn(state);
      if (pendingTurn(state) || turn?.id !== action.turnId) return state;
      const retrying = { result: turn.result, version: state.versions[state.versions.length - 1]! };
      const turns = state.turns.map((t) => (t.id === action.turnId ? { ...sent(t), retrying } : t));
      return { ...state, turns, versions: state.versions.slice(0, -1) };
    }
    case "saved":
      return { ...state, original: workingSource(state) };
  }
}

/** Whether the working slip differs from the original (as opened or last saved). */
export function hasUnsavedChanges(state: Session): boolean {
  return workingSource(state) !== state.original;
}

/** Whether Undo has a version to step back to (and Flint isn't mid-reply). */
export function canUndo(state: Session): boolean {
  return state.versions.length > 1 && !pendingTurn(state);
}

/** Whether Redo has an undone version to reapply (and Flint isn't mid-reply). */
export function canRedo(state: Session): boolean {
  return state.redo.length > 0 && !pendingTurn(state);
}

/** The turn Try again would redo: the latest turn, when its edit is the working slip. */
export function retryableTurn(state: Session): (Turn & { result: TurnResult }) | undefined {
  const last = state.turns[state.turns.length - 1];
  const top = state.versions[state.versions.length - 1]!;
  if (!last?.result || last.undone || last.result.type !== "edit" || top.turnId !== last.id) return undefined;
  return { ...last, result: last.result };
}

/** The template the working slip shows and the next request edits. */
export function workingSource(state: Session): string {
  return state.versions[state.versions.length - 1]!.source;
}

/** The turn awaiting Flint's reply, if any. */
export function pendingTurn(state: Session): Turn | undefined {
  return state.turns.find((t) => !t.result);
}

/**
 * The conversation as sent to Ember: the last few answered turns that weren't undone. Error turns
 * are left out: "Flint is resting" and the like aren't Flint's replies. (The Worker trims too.)
 */
export function historyForEmber(state: Session): HistoryTurn[] {
  return state.turns
    .filter((t): t is Turn & { result: TurnResult } => !!t.result && !t.undone && t.result.type !== "error")
    .slice(-HISTORY_LIMIT)
    .map((t) => ({
      user: t.message,
      flint: flintText(t.result),
      ...(t.selection ? { selection: t.selection.note } : {}),
    }));
}
