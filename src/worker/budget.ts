import { DurableObject } from "cloudflare:workers";
import {
  costNanoUsd,
  NANO_USD_PER_USD,
  requestBody,
  worstCaseNanoUsd,
  type EmberClient,
  type Usage,
} from "../core";

// The global Muse Ember budget: one Durable Object, so every reservation is checked against one
// strictly consistent total. Each Ember call reserves its worst-case cost first and settles its
// actual usage after; a reservation that would pass the cap is refused.

/** The name of the one budget object all live turns share. */
export const GLOBAL_BUDGET = "global";

export type Reservation = { ok: true; id: string } | { ok: false };

export type BudgetSnapshot = {
  capNanoUsd: number;
  spentNanoUsd: number;
  /** Held by calls in flight (or by calls whose Worker died before settling). */
  reservedNanoUsd: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  /** What's left of the cap after spending and open reservations, 0â€“100. */
  remainingPct: number;
};

type Totals = { spentNanoUsd: number; inputTokens: number; cachedInputTokens: number; outputTokens: number };

const TOTALS_KEY = "totals";
const RESERVATION_PREFIX = "reservation:";
const EMPTY_TOTALS: Totals = { spentNanoUsd: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };

/** The cap from TOKEN_BUDGET_USD. Anything unreadable is a zero cap: live mode fails closed. */
export function capNanoUsd(env: Env): number {
  const usd = Number(env.TOKEN_BUDGET_USD);
  return Number.isFinite(usd) && usd > 0 ? Math.floor(usd * NANO_USD_PER_USD) : 0;
}

export class BudgetDO extends DurableObject<Env> {
  // Synchronous SQLite-backed storage: each method runs start to finish with no await in between,
  // so check-then-write is atomic.
  private get storage() {
    return this.ctx.storage.kv;
  }

  private totals(): Totals {
    return this.storage.get<Totals>(TOTALS_KEY) ?? EMPTY_TOTALS;
  }

  private reservedNanoUsd(): number {
    let reserved = 0;
    for (const [, amount] of this.storage.list<number>({ prefix: RESERVATION_PREFIX })) reserved += amount;
    return reserved;
  }

  async reserve(nanoUsd: number): Promise<Reservation> {
    const amount = Math.max(0, Math.ceil(nanoUsd));
    if (this.totals().spentNanoUsd + this.reservedNanoUsd() + amount > capNanoUsd(this.env)) return { ok: false };
    const id = crypto.randomUUID();
    this.storage.put(RESERVATION_PREFIX + id, amount);
    return { ok: true, id };
  }

  /** Replaces a reservation with the call's actual cost, or keeps all of it when usage is unknown. */
  async settle(id: string, usage: Usage | null): Promise<void> {
    const key = RESERVATION_PREFIX + id;
    const reserved = this.storage.get<number>(key);
    if (reserved === undefined) return;
    const totals = this.totals();
    this.storage.put<Totals>(TOTALS_KEY, {
      spentNanoUsd: totals.spentNanoUsd + (usage ? costNanoUsd(usage) : reserved),
      inputTokens: totals.inputTokens + (usage?.inputTokens ?? 0),
      cachedInputTokens: totals.cachedInputTokens + (usage?.cachedInputTokens ?? 0),
      outputTokens: totals.outputTokens + (usage?.outputTokens ?? 0),
    });
    this.storage.delete(key);
  }

  async snapshot(): Promise<BudgetSnapshot> {
    const cap = capNanoUsd(this.env);
    const totals = this.totals();
    const reserved = this.reservedNanoUsd();
    const left = Math.max(0, cap - totals.spentNanoUsd - reserved);
    // Floored to 2 decimals, so any spend shows and 100% means untouched.
    const remainingPct = cap > 0 ? Math.floor((left / cap) * 10_000) / 100 : 0;
    return { capNanoUsd: cap, ...totals, reservedNanoUsd: reserved, remainingPct };
  }
}

/** Thrown when the budget refuses a call's reservation. */
export class BudgetExhausted extends Error {
  constructor() {
    super("The Muse Ember budget is spent");
    this.name = "BudgetExhausted";
  }
}

type BudgetStub = Pick<BudgetDO, "reserve" | "settle">;

/**
 * Wraps an Ember client so every call reserves its worst-case cost before it goes out and settles
 * its actual usage when it returns. A failed call keeps its whole reservation, since what Ember
 * charged for it is unknown.
 */
export function budgetedEmber(ember: EmberClient, budget: BudgetStub): EmberClient {
  return {
    async respond(request) {
      const reservation = await budget.reserve(worstCaseNanoUsd(JSON.stringify(requestBody(request))));
      if (!reservation.ok) throw new BudgetExhausted();
      let usage: Usage | null = null;
      try {
        const response = await ember.respond(request);
        usage = response.usage;
        return response;
      } finally {
        await budget.settle(reservation.id, usage);
      }
    },
  };
}
