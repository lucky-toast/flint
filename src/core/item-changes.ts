import { renderSlip } from "./liquid";
import type { Order, Shop } from "./schema";

// The item-change counter (docs/flint-spec.md, "Item-change counter"). It renders every example
// order before and after an edit and counts how many times each existing line item's title shows.
// It informs and never blocks, and costs no tokens. Only the order's own items are counted, so a
// brand-new line (a promo item, say) is never "extra". Plain string work, so it runs anywhere.

/** How one example order's slip changed. Only orders with a change are reported. */
export type OrderItemChanges = {
  orderNumber: string;
  /** Titles shown fewer times than before (usually not at all). */
  missing: string[];
  /** Titles shown more times than before. */
  extra: string[];
  /** The items' prices no longer show. */
  pricesHidden: boolean;
};

export type ItemChanges = { orders: OrderItemChanges[] };

/** Compares two template sources across every example order of the shop. Orders that fail to render are skipped. */
export async function compareItems(
  before: string,
  after: string,
  shop: Shop,
  assets: Record<string, string> = shop.assets,
): Promise<ItemChanges> {
  const orders: OrderItemChanges[] = [];
  for (const order of shop.orders) {
    let beforeText: string;
    let afterText: string;
    try {
      beforeText = slipText(await renderSlip(before, shop, order, assets));
      afterText = slipText(await renderSlip(after, shop, order, assets));
    } catch {
      continue;
    }
    const change = compareOrder(order, beforeText, afterText);
    if (change.missing.length || change.extra.length || change.pricesHidden) orders.push(change);
  }
  return { orders };
}

function compareOrder(order: Order, before: string, after: string): OrderItemChanges {
  const titles = unique(order.lineItems.map((item) => normalize(item.title)));
  const countsBefore = countTitles(before, titles);
  const countsAfter = countTitles(after, titles);
  const missing: string[] = [];
  const extra: string[] = [];
  for (const item of order.lineItems) {
    const title = normalize(item.title);
    const was = countsBefore.get(title)!;
    const now = countsAfter.get(title)!;
    if (was > 0 && now < was && !missing.includes(item.title)) missing.push(item.title);
    if (was > 0 && now > was && !extra.includes(item.title)) extra.push(item.title);
  }

  // Prices are hidden when every price of the items still on the slip shows fewer times than before.
  const missingTitles = new Set(missing.map(normalize));
  const prices = unique(
    order.lineItems
      .filter((item) => !missingTitles.has(normalize(item.title)))
      .flatMap((item) => [item.unitPriceFormatted, item.lineTotalFormatted]),
  ).filter((price) => occurrences(before, price) > 0);
  const pricesHidden = prices.length > 0 && prices.every((price) => occurrences(after, price) < occurrences(before, price));

  return { orderNumber: order.number, missing, extra, pricesHidden };
}

/**
 * Counts each title in the slip's text, ignoring case. Longer titles are counted first and blanked
 * out, so a title inside a longer one ("Mug" in "Everyday Mug") isn't counted twice.
 */
function countTitles(text: string, titles: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  let rest = text.toLowerCase();
  for (const title of [...titles].sort((a, b) => b.length - a.length)) {
    const needle = title.toLowerCase();
    counts.set(title, occurrences(rest, needle));
    if (needle) rest = rest.split(needle).join("\u0000");
  }
  return counts;
}

function occurrences(haystack: string, needle: string): number {
  return needle ? haystack.split(needle).length - 1 : 0;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** The visible text of rendered slip HTML: no styles, scripts, comments, tags or attributes; entities decoded. */
function slipText(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(style|script)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
      if (name[0] === "#") {
        const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
      }
      return ENTITIES[name.toLowerCase()] ?? entity;
    });
  return normalize(text);
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** "#1001", "#1001 and #1003", "#1001, #1002 and #1003". */
function listOrders(numbers: string[]): string {
  const tags = numbers.map((n) => `#${n}`);
  return tags.length <= 1 ? tags.join("") : `${tags.slice(0, -1).join(", ")} and ${tags[tags.length - 1]}`;
}

/** The short "what changed" line, e.g. "#1003: 1 item missing · prices hidden on 1 order". */
export function whatChanged(changes: ItemChanges): string {
  const parts: string[] = [];
  for (const order of changes.orders) {
    const notes = [
      order.missing.length ? `${plural(order.missing.length, "item")} missing` : "",
      order.extra.length ? `${plural(order.extra.length, "item")} repeated` : "",
    ].filter(Boolean);
    if (notes.length) parts.push(`#${order.orderNumber}: ${notes.join(", ")}`);
  }
  const hidden = changes.orders.filter((o) => o.pricesHidden).length;
  if (hidden) parts.push(`prices hidden on ${plural(hidden, "order")}`);
  return parts.length ? parts.join(" · ") : "No change to items or prices";
}

/** Each title with the orders it applies to, in first-seen order. */
function byTitle(changes: ItemChanges, pick: (o: OrderItemChanges) => string[]): string | null {
  const orders = new Map<string, string[]>();
  for (const order of changes.orders) {
    for (const title of pick(order)) orders.set(title, [...(orders.get(title) ?? []), order.orderNumber]);
  }
  if (!orders.size) return null;
  return [...orders].map(([title, numbers]) => `${title} on ${listOrders(numbers)}`).join("; ");
}

/** "⚠️ Missing items: Ramen Bowl on #1001 and #1003", or null when nothing is missing. */
export function missingItemsWarning(changes: ItemChanges): string | null {
  const list = byTitle(changes, (o) => o.missing);
  return list && `⚠️ Missing items: ${list}`;
}

/** "⚠️ Extra items: Bud Vase on #1003 and #1005", or null when nothing shows more than before. */
export function extraItemsWarning(changes: ItemChanges): string | null {
  const list = byTitle(changes, (o) => o.extra);
  return list && `⚠️ Extra items: ${list}`;
}
