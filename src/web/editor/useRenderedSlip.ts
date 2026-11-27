import { useEffect, useState } from "react";
import { instrumentSource, renderSlip, type Order, type Shop } from "../../core";

export type Rendered = { status: "rendering" } | { status: "ok"; html: string } | { status: "error"; message: string };

/**
 * Renders a template source for one order with the shop's real assets, re-rendering when any input
 * changes. With `instrument`, it renders the preview-only copy whose tags carry their source lines
 * (see instrumentSource), falling back to the template as it is if that copy doesn't render.
 */
export function useRenderedSlip(
  source: string,
  shop: Shop,
  order: Order,
  assets: Record<string, string> = shop.assets,
  { instrument = false }: { instrument?: boolean } = {},
) {
  const [rendered, setRendered] = useState<Rendered>({ status: "rendering" });

  useEffect(() => {
    let cancelled = false;
    const render = instrument
      ? renderSlip(instrumentSource(source), shop, order, assets).catch(() => renderSlip(source, shop, order, assets))
      : renderSlip(source, shop, order, assets);
    render.then(
      (html) => !cancelled && setRendered({ status: "ok", html }),
      (err: unknown) => !cancelled && setRendered({ status: "error", message: String(err) }),
    );
    return () => {
      cancelled = true;
    };
  }, [source, shop, order, assets, instrument]);

  return rendered;
}
