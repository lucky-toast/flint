// Data: demo shops (with their example orders and assets) and the built-in templates.
import type { Shop, Template } from "../core";
import { kilnAndCo } from "./shops/kiln-and-co";
import { classic } from "./templates/classic";

export const shops: Shop[] = [kilnAndCo];

export const builtInTemplates: Template[] = [classic];

export function defaultOrder(shop: Shop) {
  const order = shop.orders.find((o) => o.id === shop.defaultOrderId);
  if (!order) throw new Error(`Shop ${shop.id} has no default order ${shop.defaultOrderId}`);
  return order;
}
