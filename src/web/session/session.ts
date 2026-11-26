import type { HistoryTurn, TurnResult } from "../../core";
import { flintText } from "./flint-text";

// The editor's client state for one shop + template: the version stack and the chat, as turns.
// Pure data and a reducer, so features (undo, try again, uploads, chips…) add actions here and
// components only read selectors. Nothing here talks to the network; see useSession.ts.

/** One exchange: what the seller sent and, once it arrives, Flint's outcome. */
export type Turn = {
  id: number;
  message: string;
  /** Undefined while Flint is thinking. */
  result?: TurnResult;
  /** Undone turns stay in the chat (marked) but are dropped from the history sent to Ember. */
  undone?: boolean;
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
};

export type SessionAction =
  | { type: "sent"; message: string }
  | { type: "replied"; turnId: number; result: TurnResult };

export function createSession(source: string): Session {
  return { original: source, versions: [{ source, turnId: null }], turns: [], nextTurnId: 1 };
}

export function sessionReducer(state: Session, action: SessionAction): Session {
  switch (action.type) {
    case "sent": {
      const turn: Turn = { id: state.nextTurnId, message: action.message };
      return { ...state, turns: [...state.turns, turn], nextTurnId: state.nextTurnId + 1 };
    }
    case "replied": {
      const { turnId, result } = action;
      const turns = state.turns.map((t) => (t.id === turnId ? { ...t, result } : t));
      const versions =
        result.type === "edit" ? [...state.versions, { source: result.templateSource, turnId }] : state.versions;
      return { ...state, turns, versions };
    }
  }
}

/** The template the working slip shows and the next request edits. */
export function workingSource(state: Session): string {
  return state.versions[state.versions.length - 1]!.source;
}

/** The turn awaiting Flint's reply, if any. */
export function pendingTurn(state: Session): Turn | undefined {
  return state.turns.find((t) => !t.result);
}

/** The conversation as sent to Ember: answered, not-undone turns. (The Worker trims it to the last few.) */
export function historyForEmber(state: Session): HistoryTurn[] {
  return state.turns
    .filter((t): t is Turn & { result: TurnResult } => !!t.result && !t.undone)
    .map((t) => ({ user: t.message, flint: flintText(t.result) }));
}
