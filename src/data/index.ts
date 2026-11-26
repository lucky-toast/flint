// Data: demo shops (with their example orders and assets) and the built-in templates.
import type { Shop, Template } from "../core";
import { kilnAndCo } from "./shops/kiln-and-co";
import { secondStitch } from "./shops/second-stitch";
import { stickerBarn } from "./shops/sticker-barn";
import { boutique } from "./templates/boutique";
import { classic } from "./templates/classic";
import { compact } from "./templates/compact";

export const shops: Shop[] = [kilnAndCo, secondStitch, stickerBarn];

export const builtInTemplates: Template[] = [classic, compact, boutique];

export function defaultOrder(shop: Shop) {
  const order = shop.orders.find((o) => o.id === shop.defaultOrderId);
  if (!order) throw new Error(`Shop ${shop.id} has no default order ${shop.defaultOrderId}`);
  return order;
}

export { findReplay, REPLAY_CHIPS, REPLAY_SHOP_ID, type ReplayCall } from "./replay";
