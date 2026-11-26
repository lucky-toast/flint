import { useEffect, useState } from "react";
import { renderSlip } from "../core";
import { builtInTemplates, defaultOrder, shops } from "../data";
import { SlipPreview } from "./SlipPreview";

type Rendered = { status: "rendering" } | { status: "ok"; html: string } | { status: "error"; message: string };

export function App() {
  const shop = shops[0]!;
  const template = builtInTemplates[0]!;
  const order = defaultOrder(shop);
  const [rendered, setRendered] = useState<Rendered>({ status: "rendering" });

  useEffect(() => {
    let cancelled = false;
    renderSlip(template.source, shop, order).then(
      (html) => !cancelled && setRendered({ status: "ok", html }),
      (err: unknown) => !cancelled && setRendered({ status: "error", message: String(err) }),
    );
    return () => {
      cancelled = true;
    };
  }, [shop, template, order]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Flint</h1>
        <p>
          {shop.name} · {template.name} · Order #{order.number} ({order.label})
        </p>
      </header>
      <main className="app-main">
        {rendered.status === "ok" && <SlipPreview html={rendered.html} paper={template.paper} />}
        {rendered.status === "rendering" && <p>Rendering…</p>}
        {rendered.status === "error" && <p role="alert">This template couldn't be rendered: {rendered.message}</p>}
      </main>
    </div>
  );
}
