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

type Parsed = { ok: true; request: TurnRequest } | { ok: false; error: string };

function isHistoryTurn(value: unknown): value is HistoryTurn {
  if (!value || typeof value !== "object") return false;
  const t = value as HistoryTurn;
  return typeof t.user === "string" && typeof t.flint === "string";
}

/** Checks a POST /api/turn body. History beyond the last few turns is trimmed, not refused. */
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
  if (retryHint !== undefined && (typeof retryHint !== "string" || retryHint.length > MAX_MESSAGE_LENGTH)) {
    return { ok: false, error: `retryHint must be a string of at most ${MAX_MESSAGE_LENGTH} characters` };
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
      history: history.slice(-HISTORY_LIMIT),
      message,
      ...(retryHint ? { retryHint } : {}),
      ...(uploadedAssets?.length ? { uploadedAssets } : {}),
    },
  };
}
