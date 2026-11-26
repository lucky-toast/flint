// Per-visitor rate limits on live turns, using the Workers rate-limiting binding: about 10 messages
// a minute per IP and 20 a minute per session. (The binding only offers 10 s or 60 s windows.)
// Its counters are per Cloudflare location and eventually consistent: fine for abuse limits; the
// hard spending cap is the budget object.

/** The browser sends a random per-tab session id in this header. */
export const SESSION_HEADER = "x-flint-session";

/** Session ids are capped so a client can't send an arbitrarily long key. */
const MAX_SESSION_LENGTH = 64;

/** True when this request is within both limits. Each call counts as one message. */
export async function withinRateLimits(request: Request, env: Env): Promise<boolean> {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const { success: ipOk } = await env.RATE_LIMIT_IP.limit({ key: ip });
  if (!ipOk) return false;

  const session = request.headers.get(SESSION_HEADER)?.slice(0, MAX_SESSION_LENGTH);
  if (!session) return true;
  const { success: sessionOk } = await env.RATE_LIMIT_SESSION.limit({ key: session });
  return sessionOk;
}
