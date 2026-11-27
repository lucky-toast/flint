import { useEffect, useState } from "react";
import {
  compareItems,
  extraItemsWarning,
  missingItemsWarning,
  whatChanged,
  type ItemChanges as Changes,
  type Shop,
} from "../../core";

type Props = {
  /** What the working slip is compared against. */
  original: string;
  working: string;
  shop: Shop;
  assets?: Record<string, string>;
};

/**
 * The what-changed line and the missing/extra item warnings, across every example order.
 * Shown once the working slip differs from the original. The warnings inform and never block.
 */
export function ItemChanges({ original, working, shop, assets }: Props) {
  const changes = useItemChanges(original, working, shop, assets);
  if (!changes) return null;
  const missing = missingItemsWarning(changes);
  const extra = extraItemsWarning(changes);
  return (
    <div className="item-changes">
      <p className={missing || extra || changes.orders.length ? "what-changed" : "what-changed what-changed-ok"} data-testid="what-changed">
        {whatChanged(changes)}
      </p>
      {missing && (
        <p className="item-warning" role="status" data-testid="missing-items">
          {missing}
        </p>
      )}
      {extra && (
        <p className="item-warning" role="status" data-testid="extra-items">
          {extra}
        </p>
      )}
    </div>
  );
}

/** The counter's result for the current working slip, or null when it matches the original (or is still counting). */
function useItemChanges(original: string, working: string, shop: Shop, assets?: Record<string, string>) {
  const [result, setResult] = useState<{ working: string; changes: Changes } | null>(null);

  useEffect(() => {
    if (working === original) return;
    let cancelled = false;
    compareItems(original, working, shop, assets).then((changes) => !cancelled && setResult({ working, changes }));
    return () => {
      cancelled = true;
    };
  }, [original, working, shop, assets]);

  return working !== original && result?.working === working ? result.changes : null;
}
