import { DurableObject } from "cloudflare:workers";

// The per-visit cap on live messages: one Durable Object per session id (a browser tab, see
// src/web/api.ts), counting every live message that session has sent. Unlike the rate-limit
// binding it never resets, and it's strictly consistent.

const COUNT_KEY = "count";

/** The cap from SESSION_MESSAGE_CAP. Anything unreadable is a zero cap: live mode fails closed. */
export function sessionMessageCap(env: Env): number {
  const cap = Number(env.SESSION_MESSAGE_CAP);
  return Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : 0;
}

export class SessionCapDO extends DurableObject<Env> {
  /** Counts one message and returns true, or returns false once the session has used up the cap. */
  async take(): Promise<boolean> {
    const count = this.ctx.storage.kv.get<number>(COUNT_KEY) ?? 0;
    if (count >= sessionMessageCap(this.env)) return false;
    this.ctx.storage.kv.put(COUNT_KEY, count + 1);
    return true;
  }
}
