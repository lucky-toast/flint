import { createLiquid, renderContext } from "./liquid";
import type { Shop } from "./schema";

export type ValidationResult = { ok: true } | { ok: false; error: string };

// A 1x1 transparent GIF: validation only needs every asset name to resolve, not the real image.
const PLACEHOLDER_IMAGE = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

const liquid = createLiquid();

/** Placeholder images under each of the shop's asset names. */
export function placeholderAssets(assetNames: string[]): Record<string, string> {
  return Object.fromEntries(assetNames.map((name) => [name, PLACEHOLDER_IMAGE]));
}

/**
 * A template is valid when it parses and renders against every example order for the shop.
 * Unknown filters, variables or assets are errors (strict mode), named with their line and column.
 */
export async function validateTemplate(source: string, shop: Shop): Promise<ValidationResult> {
  const assets = placeholderAssets(Object.keys(shop.assets));
  try {
    const parsed = liquid.parse(source);
    for (const order of shop.orders) {
      try {
        await liquid.render(parsed, renderContext(shop, order, assets));
      } catch (err) {
        return { ok: false, error: `${errorMessage(err)} (rendering order #${order.number})` };
      }
    }
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
  return { ok: true };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
