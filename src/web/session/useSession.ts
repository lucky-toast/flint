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
} from "./session";

export type SessionApi = {
  state: Session;
  /** True from send until Flint's reply arrives. */
  thinking: boolean;
  /** Sends a seller message to Flint. Ignored while Flint is thinking or when empty/too long. */
  send: (message: string) => void;
  /** Steps the working slip back one version. Ignored when there's nothing to undo. */
  undo: () => void;
  /** Undoes the latest edit and asks Flint for a different approach to the same request. */
  tryAgain: () => void;
  /** Marks the working slip as saved, so the original pane resets to it. */
  saved: () => void;
};

export type SessionOptions = {
  /** The names of the seller's uploaded images, read at send time so a just-uploaded one is included. */
  uploadedAssetNames?: () => string[];
};

/** The editor session for one shop + template, wired to the Worker. */
export function useSession(shop: Shop, template: Template, options: SessionOptions = {}): SessionApi {
  const [state, dispatch] = useReducer(sessionReducer, template.source, createSession);
  // The latest state, so callbacks can read it without being recreated on every change.
  const latest = useRef(state);
  latest.current = state;
  const uploadedAssetNames = useRef(options.uploadedAssetNames);
  uploadedAssetNames.current = options.uploadedAssetNames;

  // Applies an action now, so a double click can't act twice before React re-renders.
  const apply = useCallback((action: SessionAction) => {
    dispatch(action);
    latest.current = sessionReducer(latest.current, action);
  }, []);

  /** Asks Flint about the pending turn `turnId`, against the working slip and history as they are now. */
  const ask = useCallback(
    (turnId: number, message: string, retryHint?: string) => {
      const current = latest.current;
      const request = {
        shopId: shop.id,
        templateSource: workingSource(current),
        history: historyForEmber(current),
        message,
        ...(retryHint ? { retryHint } : {}),
        uploadedAssets: uploadedAssetNames.current?.() ?? [],
      };
      void postTurn(request).then((result) => apply({ type: "replied", turnId, result }));
    },
    [shop.id, apply],
  );

  const send = useCallback(
    (raw: string) => {
      const message = raw.trim();
      const current = latest.current;
      if (!message || message.length > MAX_MESSAGE_LENGTH || pendingTurn(current)) return;
      const turnId = current.nextTurnId;
      apply({ type: "sent", message });
      // The new turn is pending, so it isn't in the history yet.
      ask(turnId, message);
    },
    [apply, ask],
  );

  const undo = useCallback(() => apply({ type: "undid" }), [apply]);

  const tryAgain = useCallback(() => {
    const current = latest.current;
    const turn = retryableTurn(current);
    if (!turn || pendingTurn(current)) return;
    apply({ type: "retried", turnId: turn.id });
    // The retried turn is pending now, so it's absent from the history, and its edit is off the stack.
    ask(turn.id, turn.message, flintText(turn.result));
  }, [apply, ask]);

  const saved = useCallback(() => apply({ type: "saved" }), [apply]);

  return { state, thinking: !!pendingTurn(state), send, undo, tryAgain, saved };
}
