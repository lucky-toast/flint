// A fake Muse Ember for the browser tests. Playwright starts it beside `wrangler dev`, and the Worker's
// MODEL_API_BASE_URL points here, so browser tests never reach the real API.
//
// Tests script it over HTTP (see ./ember.ts for the typed client and the Playwright fixture):
//   POST   /__scripts            { match, responses, delayMs? } -> { id }
//   GET    /__scripts/:id/calls  -> the Responses API request bodies this script answered
//   DELETE /__scripts/:id
//   GET    /health
// Ember's endpoint:
//   POST   /v1/responses         answered by the script whose `match` occurs in the turn's user message
//                                (the longest match wins). The response served is responses[attempt - 1],
//                                where the attempt is counted from the retry items in the request, so
//                                the fake is stateless across turns and parallel tests don't interfere.
// Unscripted calls get a 500, which the Worker reports as "Flint is resting". Calls without the
// placeholder key from .dev.vars.e2e get a 401, so a leaked real key fails the test instead.
//
// Runs with Node's built-in type stripping (`node test/e2e/support/fake-ember-server.ts <port>`),
// so it uses erasable TypeScript only and imports nothing but Node built-ins.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

type Script = { id: string; match: string; responses: unknown[]; delayMs: number; calls: unknown[] };

const port = Number(process.argv[2] ?? process.env.FAKE_EMBER_PORT ?? 10788);
const scripts = new Map<string, Script>();
let nextId = 1;

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "null");
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

/** The first input item is the turn's user message; every later user message or tool output is a retry. */
function turnOf(body: any): { message: string; attempt: number } {
  const input: any[] = Array.isArray(body?.input) ? body.input : [];
  const first = input[0]?.content;
  const message = typeof first === "string" ? first : JSON.stringify(first ?? "");
  const retries = input.slice(1).filter((item) => item?.type === "function_call_output" || item?.role === "user").length;
  return { message, attempt: retries + 1 };
}

function findScript(message: string): Script | undefined {
  let best: Script | undefined;
  for (const script of scripts.values()) {
    if (message.includes(script.match) && (!best || script.match.length > best.match.length)) best = script;
  }
  return best;
}

/** The placeholder key in .dev.vars.e2e. Anything else means the Worker picked up some other key. */
const EXPECTED_AUTH = "Bearer fake-ember-key";

async function respond(req: IncomingMessage, res: ServerResponse) {
  if (req.headers.authorization !== EXPECTED_AUTH) {
    console.error("[fake-ember] refused a call that didn't carry the e2e placeholder key (check .dev.vars.e2e)");
    return send(res, 401, { error: { message: "fake Ember: unexpected API key" } });
  }
  const body = await readJson(req);
  const { message, attempt } = turnOf(body);
  const script = findScript(message);
  if (!script) {
    console.error(`[fake-ember] no script matches this turn:\n${message.slice(-300)}`);
    return send(res, 500, { error: { message: "fake Ember: unscripted request" } });
  }
  script.calls.push(body);
  const response = script.responses[attempt - 1];
  if (!response) {
    console.error(`[fake-ember] script ${script.id} (${script.match}) has no response for attempt ${attempt}`);
    return send(res, 500, { error: { message: `fake Ember: no response scripted for attempt ${attempt}` } });
  }
  if (script.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, script.delayMs));
  // A scripted HTTP failure: { httpStatus, body }.
  const failure = response as { httpStatus?: number; body?: unknown };
  if (typeof failure.httpStatus === "number") return send(res, failure.httpStatus, failure.body ?? {});
  send(res, 200, response);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://fake-ember");
    const parts = url.pathname.split("/").filter(Boolean);
    if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true });
    if (req.method === "POST" && url.pathname === "/v1/responses") return await respond(req, res);
    if (parts[0] === "__scripts") {
      if (req.method === "POST" && parts.length === 1) {
        const { match, responses, delayMs } = await readJson(req);
        if (typeof match !== "string" || !match || !Array.isArray(responses)) {
          return send(res, 400, { error: "expected { match: string, responses: [], delayMs?: number }" });
        }
        // Two live scripts with the same match text would answer each other's turns: tests must use distinct text.
        const clash = [...scripts.values()].find((s) => s.match === match);
        if (clash) console.error(`[fake-ember] scripts ${clash.id} and ${nextId} share the match text: ${match}`);
        const id = String(nextId++);
        scripts.set(id, { id, match, responses, delayMs: Number(delayMs) || 0, calls: [] });
        return send(res, 200, { id });
      }
      const script = parts[1] ? scripts.get(parts[1]) : undefined;
      if (!script) return send(res, 404, { error: "no such script" });
      if (req.method === "GET" && parts[2] === "calls") return send(res, 200, script.calls);
      if (req.method === "DELETE" && parts.length === 2) {
        scripts.delete(script.id);
        return send(res, 200, { ok: true });
      }
    }
    send(res, 404, { error: "not found" });
  } catch (err) {
    send(res, 500, { error: String(err) });
  }
});

server.listen(port, "127.0.0.1", () => console.log(`[fake-ember] listening on http://127.0.0.1:${port}`));
