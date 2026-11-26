import type { Shop, Template } from "../../core";

/**
 * The seller's saved templates for one shop, shown in the template picker beside the built-ins.
 * Saving lands in a later ticket (#12); until then every shop has none.
 */
export function useSavedTemplates(_shop: Shop): Template[] {
  return [];
}
