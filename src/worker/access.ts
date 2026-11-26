// The access code: judges send it (in a request header) to use Flint live; everyone else gets replay.

/** Must match ACCESS_CODE_HEADER in src/web/access/access-code.ts. */
export const ACCESS_CODE_HEADER = "x-flint-access-code";

/** Codes are capped so a client can't send an arbitrarily long header. */
const MAX_CODE_LENGTH = 128;

/** True when the request carries the configured access code. No configured code means nobody has one. */
export function hasAccessCode(request: Request, env: Env): boolean {
  const expected = env.ACCESS_CODE;
  const given = request.headers.get(ACCESS_CODE_HEADER);
  if (!expected || !given || given.length > MAX_CODE_LENGTH) return false;
  return timingSafeEqual(given, expected);
}

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.byteLength !== right.byteLength) return false;
  return crypto.subtle.timingSafeEqual(left, right);
}
