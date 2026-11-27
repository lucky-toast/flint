import { useEffect, useState } from "react";
import { renderSlip, type Order, type Shop } from "../../core";

type Props = {
  original: string;
  working: string;
  shop: Shop;
  order: Order;
  assets?: Record<string, string>;
  onShowOrder: (orderId: string) => void;
};

/**
 * When the working slip differs from the original but not for the example order on screen (a
 * gift-only change on a non-gift order, say), says so and offers an order where the change shows.
 * Otherwise the seller sees two identical slips and thinks nothing happened.
 */
export function OrderHint({ original, working, shop, order, assets, onShowOrder }: Props) {
  const showsOn = useOrdersWithChanges(original, working, shop, assets);
  if (!showsOn || showsOn.includes(order.id)) return null;
  const other = shop.orders.find((o) => showsOn.includes(o.id));
  return (
    <p className="order-hint" role="status" data-testid="order-hint">
      This change may not show on order #{order.number}.
      {other && (
        <>
          {" "}
          <button type="button" className="order-hint-button" onClick={() => onShowOrder(other.id)}>
            See it on #{other.number} · {other.label}
          </button>
        </>
      )}
    </p>
  );
}

/**
 * The ids of the example orders where the change shows, or null while counting or when the sources
 * match. A change shows on an order when its markup (styles aside) differs there, or when a changed
 * style rule targets a class the order's slip uses. A rule without a class (say, `table`) or one we
 * can't read counts as showing everywhere, as does a change that shows on no order at all.
 */
function useOrdersWithChanges(original: string, working: string, shop: Shop, assets?: Record<string, string>) {
  const [result, setResult] = useState<{ working: string; ids: string[] } | null>(null);

  useEffect(() => {
    if (working === original) return;
    let cancelled = false;
    (async () => {
      const styles = changedStyleClasses(original, working);
      const all = shop.orders.map((o) => o.id);
      const ids: string[] = [];
      if (styles !== "everywhere") {
        for (const o of shop.orders) {
          try {
            const before = withoutStyles(await renderSlip(original, shop, o, assets));
            const after = withoutStyles(await renderSlip(working, shop, o, assets));
            if (before !== after || styles.some((c) => usesClass(after, c))) ids.push(o.id);
          } catch {
            // A slip that fails to render says so in its own pane; count it as changed.
            ids.push(o.id);
          }
        }
      }
      if (!cancelled) setResult({ working, ids: ids.length ? ids : all });
    })();
    return () => {
      cancelled = true;
    };
  }, [original, working, shop, assets]);

  return working !== original && result?.working === working ? result.ids : null;
}

function withoutStyles(html: string) {
  return html.replace(/<style[\s\S]*?<\/style>/gi, "");
}

function styleLines(source: string): Set<string> {
  const lines = new Set<string>();
  for (const block of source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const line of block[1]!.split("\n")) if (line.trim()) lines.add(line.trim());
  }
  return lines;
}

/** The classes the changed style lines target, or "everywhere" when a change isn't tied to a class. */
function changedStyleClasses(before: string, after: string): string[] | "everywhere" {
  const a = styleLines(before);
  const b = styleLines(after);
  const changed = [...a].filter((l) => !b.has(l)).concat([...b].filter((l) => !a.has(l)));
  const classes = new Set<string>();
  for (const line of changed) {
    const brace = line.indexOf("{");
    if (brace < 0) return "everywhere";
    for (const selector of line.slice(0, brace).split(",")) {
      const found = selector.match(/\.[A-Za-z_][\w-]*/g);
      if (!found) return "everywhere";
      found.forEach((c) => classes.add(c.slice(1)));
    }
  }
  return [...classes];
}

function usesClass(html: string, name: string) {
  return new RegExp(`class="[^"]*(?<![\w-])${name}(?![\w-])`).test(html);
}
