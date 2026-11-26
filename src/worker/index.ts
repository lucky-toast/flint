// Flint Worker: serves the static app (via the ASSETS binding) and the /api/* routes.
import { createEmberClient, DEFAULT_EMBER_BASE_URL, EmberError, runTurn, type TurnResult } from "../core";
import { shops } from "../data";
import { parseTurnRequest } from "./turn-request";

export type Status = { live: boolean; budgetRemainingPct: number };

/** Live mode: the kill switch is on and a model key is configured. (The access code lands in a later ticket.) */
function isLive(env: Env): boolean {
  return env.LIVE_MODE === "on" && !!env.EMBER_API_KEY;
}

function status(env: Env): Status {
  // Budget tracking (Durable Object) lands in a later ticket; until then the budget is untouched.
  return { live: env.LIVE_MODE === "on", budgetRemainingPct: 100 };
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

  // Replay mode lands in a later ticket; until then a non-live Worker is "resting".
  if (!isLive(env)) return Response.json({ type: "error", error: "resting" } satisfies TurnResult);

  const ember = createEmberClient({
    apiKey: env.EMBER_API_KEY!,
    baseUrl: env.MODEL_API_BASE_URL || DEFAULT_EMBER_BASE_URL,
  });
  try {
    return Response.json(await runTurn({ ember, shop, input }));
  } catch (err) {
    if (!(err instanceof EmberError)) throw err;
    console.error(err.message);
    return Response.json({ type: "error", error: "resting" } satisfies TurnResult);
  }
}

async function handleApi(request: Request, env: Env, path: string): Promise<Response> {
  if (path === "/api/status" && request.method === "GET") {
    return Response.json(status(env));
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
