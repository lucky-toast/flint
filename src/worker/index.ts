// Flint Worker: serves the static app (via the ASSETS binding) and the /api/* routes.

export type Status = { live: boolean; budgetRemainingPct: number };

function status(env: Env): Status {
  // Budget tracking (Durable Object) lands in a later ticket; until then the budget is untouched.
  return { live: env.LIVE_MODE === "on", budgetRemainingPct: 100 };
}

async function handleApi(request: Request, env: Env, path: string): Promise<Response> {
  if (path === "/api/status" && request.method === "GET") {
    return Response.json(status(env));
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
