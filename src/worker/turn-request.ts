import {
  HISTORY_LIMIT,
  isAssetName,
  MAX_MESSAGE_LENGTH,
  MAX_UPLOADED_ASSETS,
  type HistoryTurn,
  type TurnRequest,
} from "../core";

/** Generous cap on the working template, so one request can't carry an unbounded prompt. */
const MAX_TEMPLATE_LENGTH = 50_000;

/** Past exchanges are trimmed to these lengths, so a long history can't carry an unbounded prompt. */
export const MAX_HISTORY_USER_LENGTH = MAX_MESSAGE_LENGTH;
export const MAX_HISTORY_FLINT_LENGTH = 1000;

/** The longest retry hint sent on; a longer one (a long summary) is trimmed rather than refused. */
export const MAX_RETRY_HINT_LENGTH = MAX_MESSAGE_LENGTH;

type Parsed = { ok: true; request: TurnRequest } | { ok: false; error: string };

function isHistoryTurn(value: unknown): value is HistoryTurn {
  if (!value || typeof value !== "object") return false;
  const t = value as HistoryTurn;
  return typeof t.user === "string" && typeof t.flint === "string";
}

/**
 * Checks a POST /api/turn body. History beyond the last few turns, over-long history turns and an
 * over-long retry hint are trimmed, not refused.
 */
export function parseTurnRequest(body: unknown): Parsed {
  if (!body || typeof body !== "object") return { ok: false, error: "body must be an object" };
  const { shopId, templateSource, history, message, retryHint, uploadedAssets } = body as Record<string, unknown>;
  if (typeof shopId !== "string") return { ok: false, error: "shopId must be a string" };
  if (typeof templateSource !== "string" || templateSource.length > MAX_TEMPLATE_LENGTH) {
    return { ok: false, error: `templateSource must be a string of at most ${MAX_TEMPLATE_LENGTH} characters` };
  }
  if (!Array.isArray(history) || !history.every(isHistoryTurn)) {
    return { ok: false, error: "history must be an array of { user, flint } strings" };
  }
  if (typeof message !== "string" || message.trim() === "" || message.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: `message must be 1-${MAX_MESSAGE_LENGTH} characters` };
  }
  if (retryHint !== undefined && typeof retryHint !== "string") {
    return { ok: false, error: "retryHint must be a string" };
  }
  if (
    uploadedAssets !== undefined &&
    (!Array.isArray(uploadedAssets) || uploadedAssets.length > MAX_UPLOADED_ASSETS || !uploadedAssets.every(isAssetName))
  ) {
    return { ok: false, error: `uploadedAssets must be at most ${MAX_UPLOADED_ASSETS} asset names` };
  }
  return {
    ok: true,
    request: {
      shopId,
      templateSource,
      history: history.slice(-HISTORY_LIMIT).map((t) => ({
        user: t.user.slice(0, MAX_HISTORY_USER_LENGTH),
        flint: t.flint.slice(0, MAX_HISTORY_FLINT_LENGTH),
      })),
      message,
      ...(retryHint ? { retryHint: retryHint.slice(0, MAX_RETRY_HINT_LENGTH) } : {}),
      ...(uploadedAssets?.length ? { uploadedAssets } : {}),
    },
  };
}
