// Flint Worker: serves the static app (via the ASSETS binding) and the /api/* routes.
import { createEmberClient, DEFAULT_EMBER_BASE_URL, EmberError, runTurn, type TurnRequest, type TurnResult } from "../core";
import { shops } from "../data";
import { budgetedEmber, BudgetExhausted, GLOBAL_BUDGET } from "./budget";
import { withinRateLimits } from "./rate-limits";
import { parseTurnRequest } from "./turn-request";

export { BudgetDO } from "./budget";

export type Status = { live: boolean; budgetRemainingPct: number };

/** Live mode: the kill switch is on and a model key is configured. (The access code lands in a later ticket.) */
function isLive(env: Env): boolean {
  return env.LIVE_MODE === "on" && !!env.EMBER_API_KEY;
}

function budget(env: Env) {
  return env.BUDGET.getByName(GLOBAL_BUDGET);
}

async function status(env: Env): Promise<Status> {
  const { remainingPct } = await budget(env).snapshot();
  return { live: isLive(env), budgetRemainingPct: remainingPct };
}

/** Why a turn isn't served live. */
type NotLiveReason = "off" | "rate_limited" | "budget" | "ember_failed";

/**
 * Answers a turn that can't (or can no longer) be served live. The replay ticket hooks in here:
 * a request matching a recording is answered from replay; anything else rests.
 */
function notLive(_request: TurnRequest, reason: NotLiveReason): Response {
  console.log(`turn not live: ${reason}`);
  return Response.json({ type: "error", error: "resting" } satisfies TurnResult);
}

async function turn(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad_request", detail: "body must be JSON" }, { status: 400 });
  }
  const parsed = parseTurnRequest(body);
  if (!parsed.ok) return Response.json({ error: "bad_request", detail: parsed.error }, { status: 400 });

  const { shopId, ...input } = parsed.request;
  const shop = shops.find((s) => s.id === shopId);
  if (!shop) return Response.json({ error: "bad_request", detail: `unknown shop ${shopId}` }, { status: 400 });

  if (!isLive(env)) return notLive(parsed.request, "off");
  if (!(await withinRateLimits(request, env))) return notLive(parsed.request, "rate_limited");

  // Every Ember call reserves its worst case in the budget first and settles its actual usage after.
  const ember = budgetedEmber(
    createEmberClient({ apiKey: env.EMBER_API_KEY!, baseUrl: env.MODEL_API_BASE_URL || DEFAULT_EMBER_BASE_URL }),
    budget(env),
  );
  try {
    return Response.json(await runTurn({ ember, shop, input }));
  } catch (err) {
    if (err instanceof BudgetExhausted) return notLive(parsed.request, "budget");
    if (!(err instanceof EmberError)) throw err;
    console.error(err.message);
    return notLive(parsed.request, "ember_failed");
  }
}

async function handleApi(request: Request, env: Env, path: string): Promise<Response> {
  if (path === "/api/status" && request.method === "GET") {
    return Response.json(await status(env));
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
