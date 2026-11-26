import { useEffect, useState } from "react";
import { renderSlip, type Order, type Shop } from "../../core";

export type Rendered = { status: "rendering" } | { status: "ok"; html: string } | { status: "error"; message: string };

/** Renders a template source for one order with the shop's real assets, re-rendering when any input changes. */
export function useRenderedSlip(source: string, shop: Shop, order: Order, assets: Record<string, string> = shop.assets) {
  const [rendered, setRendered] = useState<Rendered>({ status: "rendering" });

  useEffect(() => {
    let cancelled = false;
    renderSlip(source, shop, order, assets).then(
      (html) => !cancelled && setRendered({ status: "ok", html }),
      (err: unknown) => !cancelled && setRendered({ status: "error", message: String(err) }),
    );
    return () => {
      cancelled = true;
    };
  }, [source, shop, order, assets]);

  return rendered;
}
