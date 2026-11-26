import { useCallback, useReducer, useRef } from "react";
import { MAX_MESSAGE_LENGTH, type Shop, type Template } from "../../core";
import { postTurn } from "../api";
import { flintText } from "./flint-text";
import {
  createSession,
  historyForEmber,
  pendingTurn,
  retryableTurn,
  sessionReducer,
  workingSource,
  type Session,
  type SessionAction,
  type TurnSelection,
} from "./session";

export type SessionApi = {
  state: Session;
  /** True from send until Flint's reply arrives. */
  thinking: boolean;
  /**
   * Sends a seller message to Flint, with what they pointed at on the working slip, if anything.
   * Ignored while Flint is thinking or when empty/too long.
   */
  send: (message: string, selection?: TurnSelection) => void;
  /** Steps the working slip back one version. Ignored when there's nothing to undo. */
  undo: () => void;
  /** Reapplies the most recently undone version. Ignored when the Redo stack is empty. */
  redo: () => void;
  /**
   * Sets the latest edit aside and asks Flint for a different approach to the same request. If
   * Flint can't, the edit comes back and Flint's error shows as a note.
   */
  tryAgain: () => void;
  /** Marks the working slip as saved, so the original pane resets to it. */
  saved: () => void;
};

export type SessionOptions = {
  /** The names of the seller's uploaded images, read at send time so a just-uploaded one is included. */
  uploadedAssetNames?: () => string[];
  /** Told when one of Flint's edits lands on the working slip (not on Undo, Redo or a restored retry). */
  onEdited?: () => void;
};

/** The editor session for one shop + template, wired to the Worker. */
export function useSession(shop: Shop, template: Template, options: SessionOptions = {}): SessionApi {
  const [state, dispatch] = useReducer(sessionReducer, template.source, createSession);
  // The latest state, so callbacks can read it without being recreated on every change.
  const latest = useRef(state);
  latest.current = state;
  const uploadedAssetNames = useRef(options.uploadedAssetNames);
  uploadedAssetNames.current = options.uploadedAssetNames;
  const onEdited = useRef(options.onEdited);
  onEdited.current = options.onEdited;

  // Applies an action now, so a double click can't act twice before React re-renders.
  const apply = useCallback((action: SessionAction) => {
    dispatch(action);
    latest.current = sessionReducer(latest.current, action);
  }, []);

  /** Asks Flint about the pending turn `turnId`, against the working slip and history as they are now. */
  const ask = useCallback(
    (turnId: number, message: string, selection?: TurnSelection, retryHint?: string) => {
      const current = latest.current;
      const request = {
        shopId: shop.id,
        templateSource: workingSource(current),
        history: historyForEmber(current),
        message,
        ...(retryHint ? { retryHint } : {}),
        ...(selection ? { selection: selection.note } : {}),
        uploadedAssets: uploadedAssetNames.current?.() ?? [],
      };
      void postTurn(request).then((result) => {
        apply({ type: "replied", turnId, result });
        if (result.type === "edit") onEdited.current?.();
      });
    },
    [shop.id, apply],
  );

  const send = useCallback(
    (raw: string, selection?: TurnSelection) => {
      const message = raw.trim();
      const current = latest.current;
      if (!message || message.length > MAX_MESSAGE_LENGTH || pendingTurn(current)) return;
      const turnId = current.nextTurnId;
      apply({ type: "sent", message, ...(selection ? { selection } : {}) });
      // The new turn is pending, so it isn't in the history yet.
      ask(turnId, message, selection);
    },
    [apply, ask],
  );

  const undo = useCallback(() => apply({ type: "undid" }), [apply]);
  const redo = useCallback(() => apply({ type: "redid" }), [apply]);

  const tryAgain = useCallback(() => {
    const current = latest.current;
    const turn = retryableTurn(current);
    if (!turn || pendingTurn(current)) return;
    apply({ type: "retried", turnId: turn.id });
    // The retried turn is pending now, so it's absent from the history, and its edit is off the stack.
    // The Worker takes hints up to a message's length; a long summary is cut to fit.
    // It goes with the selection the turn was first sent with.
    ask(turn.id, turn.message, turn.selection, flintText(turn.result).slice(0, MAX_MESSAGE_LENGTH));
  }, [apply, ask]);

  const saved = useCallback(() => apply({ type: "saved" }), [apply]);

  return { state, thinking: !!pendingTurn(state), send, undo, redo, tryAgain, saved };
}
