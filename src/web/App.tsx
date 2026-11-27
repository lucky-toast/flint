import { useState } from "react";
import type { Template } from "../core";
import { builtInTemplates, REPLAY_CHIPS, REPLAY_SHOP_ID, shops } from "../data";
import { AccessCode } from "./access/AccessCode";
import { useAccess } from "./access/useAccess";
import { Editor } from "./editor/Editor";
import { ShopSwitcher } from "./shop/ShopSwitcher";
import { TemplatePicker } from "./templates/TemplatePicker";
import { useSavedTemplates } from "./templates/useSavedTemplates";
import { UnsavedChangesDialog, useWarnBeforeUnload } from "./UnsavedChangesDialog";

/**
 * Either the template picker for the current shop, or the editor on one of its templates.
 * `session` keys the editor: a new one per template opened, kept when Save as new renames it.
 */
type Screen = { kind: "picker" } | { kind: "editor"; template: Template; session: number };

let nextSession = 1;

export function App() {
  const [shopId, setShopId] = useState(shops[0]!.id);
  // The app opens straight into the demo: the first shop's Classic slip.
  const [screen, setScreen] = useState<Screen>({ kind: "editor", template: builtInTemplates[0]!, session: 0 });
  const [unsaved, setUnsaved] = useState(false);
  // Leaving the editor with unsaved changes waits here until the seller decides.
  const [pendingLeave, setPendingLeave] = useState<() => void>();
  const shop = shops.find((s) => s.id === shopId) ?? shops[0]!;
  const saved = useSavedTemplates(shop);
  useWarnBeforeUnload(screen.kind === "editor" && unsaved);
  const access = useAccess();
  // Replay mode offers the scripted demo requests as chips, on the shop the recordings cover.
  const replayChips = access.mode === "replay" && shop.id === REPLAY_SHOP_ID ? REPLAY_CHIPS : undefined;

  /** Runs `leave` now, or after the seller agrees to discard unsaved changes. */
  const leaveEditor = (leave: () => void) => {
    const go = () => {
      setUnsaved(false);
      leave();
    };
    if (screen.kind === "editor" && unsaved) setPendingLeave(() => go);
    else go();
  };

  const switchShop = (id: string) =>
    leaveEditor(() => {
      setShopId(id);
      setScreen({ kind: "picker" });
    });

  return (
    <div className="app">
      <header className="app-header">
        <h1>Flint</h1>
        <ShopSwitcher shops={shops} shopId={shop.id} onChange={switchShop} />
        {screen.kind === "editor" && (
          <>
            <p className="app-header-context">
              {shop.name} · {screen.template.name}
            </p>
            <button
              type="button"
              className="app-header-button"
              onClick={() => leaveEditor(() => setScreen({ kind: "picker" }))}
            >
              <span aria-hidden="true">← </span>Templates
            </button>
          </>
        )}
        <AccessCode {...access} />
      </header>
      <main className="app-main">
        {screen.kind === "picker" ? (
          <TemplatePicker
            shop={shop}
            builtIn={builtInTemplates}
            saved={saved}
            onCustomize={(template) => setScreen({ kind: "editor", template, session: nextSession++ })}
          />
        ) : (
          <Editor
            key={`${shop.id}/${screen.session}`}
            shop={shop}
            template={screen.template}
            onUnsavedChange={setUnsaved}
            onSaved={(template) => setScreen({ ...screen, template })}
            replayChips={replayChips}
          />
        )}
      </main>
      {pendingLeave && (
        <UnsavedChangesDialog
          onKeepEditing={() => setPendingLeave(undefined)}
          onDiscard={() => {
            setPendingLeave(undefined);
            pendingLeave();
          }}
        />
      )}
    </div>
  );
}
