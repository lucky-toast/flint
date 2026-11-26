import { Liquid } from "liquidjs";
import type { Order, RenderContext, Shop } from "./schema";

/** How long one render may take. A slip renders in a few milliseconds. */
export const RENDER_LIMIT_MS = 1000;

/**
 * LiquidJS's allocation budget per render (string lengths and range sizes), in characters. Slips use
 * far less, but uploaded images are data URLs of up to a few hundred KB each, so leave room.
 */
export const MEMORY_LIMIT = 10_000_000;

/**
 * The one Liquid environment Flint uses, in the browser and in the Worker:
 * built-in tags and filters only, and anything undefined is an error rather than blank output.
 */
export function createLiquid(): Liquid {
  return new Liquid({
    strictFilters: true,
    strictVariables: true,
    ownPropertyOnly: true,
    // Order dates are ISO calendar dates; format them in UTC so every viewer sees the same day.
    timezoneOffset: 0,
    // A runaway edit (say, a loop over (1..10000000)) fails as an ordinary render error, which
    // goes back to Ember, instead of running until the Worker's CPU limit kills the request.
    renderLimit: RENDER_LIMIT_MS,
    memoryLimit: MEMORY_LIMIT,
  });
}

const liquid = createLiquid();

export function renderContext(shop: Shop, order: Order, assets: Record<string, string> = shop.assets): RenderContext {
  return { shop: { name: shop.name, platform: shop.platform }, assets, order };
}

/** Renders a template's Liquid source for one order. Throws on parse or render errors. */
export async function renderSlip(
  source: string,
  shop: Shop,
  order: Order,
  assets: Record<string, string> = shop.assets,
): Promise<string> {
  return liquid.parseAndRender(source, renderContext(shop, order, assets));
}
