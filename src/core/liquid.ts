import { Liquid } from "liquidjs";
import type { Order, RenderContext, Shop } from "./schema";

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
