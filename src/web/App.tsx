import { useState } from "react";
import type { Template } from "../core";
import { builtInTemplates, shops } from "../data";
import { Editor } from "./editor/Editor";
import { ShopSwitcher } from "./shop/ShopSwitcher";
import { TemplatePicker } from "./templates/TemplatePicker";
import { useSavedTemplates } from "./templates/useSavedTemplates";

/** Either the template picker for the current shop, or the editor on one of its templates. */
type Screen = { kind: "picker" } | { kind: "editor"; template: Template };

export function App() {
  const [shopId, setShopId] = useState(shops[0]!.id);
  // The app opens straight into the demo: the first shop's Classic slip.
  const [screen, setScreen] = useState<Screen>({ kind: "editor", template: builtInTemplates[0]! });
  const shop = shops.find((s) => s.id === shopId) ?? shops[0]!;
  const saved = useSavedTemplates(shop);

  const switchShop = (id: string) => {
    setShopId(id);
    setScreen({ kind: "picker" });
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Flint</h1>
        <ShopSwitcher shops={shops} shopId={shop.id} onChange={switchShop} />
        {screen.kind === "editor" && (
          <>
            <p>
              {shop.name} · {screen.template.name}
            </p>
            <button type="button" className="app-header-button" onClick={() => setScreen({ kind: "picker" })}>
              Templates
            </button>
          </>
        )}
      </header>
      <main className="app-main">
        {screen.kind === "picker" ? (
          <TemplatePicker
            shop={shop}
            builtIn={builtInTemplates}
            saved={saved}
            onCustomize={(template) => setScreen({ kind: "editor", template })}
          />
        ) : (
          <Editor key={`${shop.id}/${screen.template.id}`} shop={shop} template={screen.template} />
        )}
      </main>
    </div>
  );
}
