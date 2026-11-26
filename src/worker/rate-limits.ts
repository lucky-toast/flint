// Per-visitor limits on live turns: about 10 messages a minute per IP, using the Workers
// rate-limiting binding (it only offers 10 s or 60 s windows), and a cap of SESSION_MESSAGE_CAP
// messages per session for the whole visit (session-cap.ts). The binding's counters are per
// Cloudflare location and eventually consistent: fine for abuse limits; the hard spending cap is
// the budget object.
import { SESSION_HEADER } from "../core";

/** Session ids are capped so a client can't send an arbitrarily long key. */
const MAX_SESSION_LENGTH = 64;

/**
 * True when this request is within both limits. Each call counts as one message. A request without
 * a session id is counted per session under its IP instead, so leaving the header out doesn't skip it.
 * A message the IP limit refuses doesn't count against the session's cap.
 */
export async function withinRateLimits(request: Request, env: Env): Promise<boolean> {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const { success: ipOk } = await env.RATE_LIMIT_IP.limit({ key: ip });
  if (!ipOk) return false;

  const session = request.headers.get(SESSION_HEADER)?.slice(0, MAX_SESSION_LENGTH) || `ip:${ip}`;
  return env.SESSION_CAP.getByName(session).take();
}
