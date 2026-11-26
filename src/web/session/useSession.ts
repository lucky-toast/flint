import { useCallback, useReducer, useRef } from "react";
import { MAX_MESSAGE_LENGTH, type Shop, type Template } from "../../core";
import { postTurn } from "../api";
import { createSession, historyForEmber, pendingTurn, sessionReducer, workingSource, type Session } from "./session";

export type SessionApi = {
  state: Session;
  /** True from send until Flint's reply arrives. */
  thinking: boolean;
  /** Sends a seller message to Flint. Ignored while Flint is thinking or when empty/too long. */
  send: (message: string) => void;
};

export type SessionOptions = {
  /** The names of the seller's uploaded images, read at send time so a just-uploaded one is included. */
  uploadedAssetNames?: () => string[];
};

/** The editor session for one shop + template, wired to the Worker. */
export function useSession(shop: Shop, template: Template, options: SessionOptions = {}): SessionApi {
  const [state, dispatch] = useReducer(sessionReducer, template.source, createSession);
  // The latest state, so `send` can read it without being recreated on every change.
  const latest = useRef(state);
  latest.current = state;
  const uploadedAssetNames = useRef(options.uploadedAssetNames);
  uploadedAssetNames.current = options.uploadedAssetNames;

  const send = useCallback(
    (raw: string) => {
      const message = raw.trim();
      const current = latest.current;
      if (!message || message.length > MAX_MESSAGE_LENGTH || pendingTurn(current)) return;
      const turnId = current.nextTurnId;
      const request = {
        shopId: shop.id,
        templateSource: workingSource(current),
        history: historyForEmber(current),
        message,
        uploadedAssets: uploadedAssetNames.current?.() ?? [],
      };
      dispatch({ type: "sent", message });
      // Mark pending synchronously so a double click can't send twice before React re-renders.
      latest.current = sessionReducer(current, { type: "sent", message });
      void postTurn(request).then((result) => dispatch({ type: "replied", turnId, result }));
    },
    [shop.id],
  );

  return { state, thinking: !!pendingTurn(state), send };
}
