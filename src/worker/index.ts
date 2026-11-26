// Flint Worker: serves the static app (via the ASSETS binding) and the /api/* routes.
import {
  createEmberClient,
  DEFAULT_EMBER_BASE_URL,
  EmberError,
  runTurn,
  type Shop,
  type Status,
  type TurnInput,
  type TurnResult,
} from "../core";
import { shops } from "../data";
import { hasAccessCode } from "./access";
import { budgetedEmber, BudgetExhausted, GLOBAL_BUDGET } from "./budget";
import { withinRateLimits } from "./rate-limits";
import { ACCESS_CODE_NOTE, replayTurn } from "./replay";
import { parseTurnRequest } from "./turn-request";

export { BudgetDO } from "./budget";

/** Live mode: the kill switch is on and a model key is configured. Each turn also needs the access code. */
function isLive(env: Env): boolean {
  return env.LIVE_MODE === "on" && !!env.EMBER_API_KEY;
}

function budget(env: Env) {
  return env.BUDGET.getByName(GLOBAL_BUDGET);
}

async function status(request: Request, env: Env): Promise<Status> {
  const { remainingPct } = await budget(env).snapshot();
  return { live: isLive(env), access: await hasAccessCode(request, env), budgetRemainingPct: remainingPct };
}

/** Why a turn isn't served live. */
type NotLiveReason = "no_access_code" | "off" | "rate_limited" | "budget" | "ember_failed";

/**
 * Answers a turn that can't (or can no longer) be served live: a request matching a recording is
 * answered from replay, spending no budget. Anything else gets the access-code note when there's
 * no code, or rests.
 */
async function notLive(shop: Shop, input: TurnInput, reason: NotLiveReason): Promise<Response> {
  if (reason !== "no_access_code") console.log(`turn not live: ${reason}`);
  const replayed = await replayTurn(shop, input);
  if (replayed) return Response.json(replayed);
  const fallback: TurnResult =
    reason === "no_access_code" ? { type: "reply", message: ACCESS_CODE_NOTE } : { type: "error", error: "resting" };
  return Response.json(fallback);
}

/** Turn bodies over this many bytes are refused before parsing. A real one is well under 60 KB. */
const MAX_TURN_BODY_BYTES = 100_000;

function tooLarge(): Response {
  return Response.json({ error: "too_large", detail: `body must be at most ${MAX_TURN_BODY_BYTES} bytes` }, { status: 413 });
}

async function turn(request: Request, env: Env): Promise<Response> {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_TURN_BODY_BYTES) return tooLarge();
  let body: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_TURN_BODY_BYTES) return tooLarge();
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "bad_request", detail: "body must be JSON" }, { status: 400 });
  }
  const parsed = parseTurnRequest(body);
  if (!parsed.ok) return Response.json({ error: "bad_request", detail: parsed.error }, { status: 400 });

  const { shopId, ...input } = parsed.request;
  const shop = shops.find((s) => s.id === shopId);
  if (!shop) return Response.json({ error: "bad_request", detail: `unknown shop ${shopId}` }, { status: 400 });

  if (!(await hasAccessCode(request, env))) return notLive(shop, input, "no_access_code");
  if (!isLive(env)) return notLive(shop, input, "off");
  if (!(await withinRateLimits(request, env))) return notLive(shop, input, "rate_limited");

  // Every Ember call reserves its worst case in the budget first and settles its actual usage after.
  const ember = budgetedEmber(
    createEmberClient({ apiKey: env.EMBER_API_KEY!, baseUrl: env.MODEL_API_BASE_URL || DEFAULT_EMBER_BASE_URL }),
    budget(env),
  );
  try {
    return Response.json(await runTurn({ ember, shop, input }));
  } catch (err) {
    if (err instanceof BudgetExhausted) return notLive(shop, input, "budget");
    if (!(err instanceof EmberError)) throw err;
    console.error(err.message);
    return notLive(shop, input, "ember_failed");
  }
}

async function handleApi(request: Request, env: Env, path: string): Promise<Response> {
  if (path === "/api/status" && request.method === "GET") {
    return Response.json(await status(request, env));
  }
  if (path === "/api/turn" && request.method === "POST") {
    return turn(request, env);
  }
  return Response.json({ error: "not_found" }, { status: 404 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url.pathname);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
