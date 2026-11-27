import { useEffect, useState } from "react";
import {
  compareItems,
  extraItemsWarning,
  missingItemsWarning,
  whatChanged,
  type ItemChanges as Changes,
  type Shop,
} from "../../core";

/** The short what-changed line; a quiet check when every item and price still shows. */
export function WhatChanged({ changes }: { changes: Changes }) {
  const clear = !missingItemsWarning(changes) && !extraItemsWarning(changes) && changes.orders.length === 0;
  return (
    <p className={clear ? "what-changed what-changed-ok" : "what-changed"} data-testid="what-changed">
      {whatChanged(changes)}
    </p>
  );
}

/** The missing/extra item warnings, across every example order. They inform and never block. */
export function ItemWarnings({ changes }: { changes: Changes }) {
  const missing = missingItemsWarning(changes);
  const extra = extraItemsWarning(changes);
  if (!missing && !extra) return null;
  return (
    <div className="item-changes">
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
export function useItemChanges(original: string, working: string, shop: Shop, assets?: Record<string, string>) {
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
