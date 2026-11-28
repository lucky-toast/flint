import { useEffect, useState } from "react";
import type { Shop, Template } from "../../core";
import { uploadFollowUp } from "../assets/asset-store";
import { useUploadedAssets } from "../assets/useUploadedAssets";
import { Chat } from "../chat/Chat";
import { SelectionTip } from "../chat/SelectionChip";
import { useSlipSelection } from "../selection/useSlipSelection";
import { canRedo, canUndo, hasUnsavedChanges, pendingTurn, retryableTurn, workingSource } from "../session/session";
import { useSession } from "../session/useSession";
import { ItemWarnings, useItemChanges, WhatChanged } from "./ItemChanges";
import { OrderHint } from "./OrderHint";
import { OrderPicker } from "./OrderPicker";
import { CodeView, SlipCodeSwitch } from "./ShowCode";
import { SlipActions } from "./SlipActions";
import { SlipPane } from "./SlipPane";

type Props = {
  shop: Shop;
  template: Template;
  /** After a save: the template the session now belongs to (the new one, or the one overwritten). */
  onSaved?: (template: Template) => void;
  /** Told whenever the working slip starts or stops differing from what was opened or last saved. */
  onUnsavedChange?: (unsaved: boolean) => void;
  /** Replay mode's suggestion chips, when replay is on for this shop. */
  replayChips?: string[];
};

/**
 * The editor for one shop + template: the original slip pinned beside the working slip, and the
 * chat with Flint. Mount it with a key per session so opening another template starts a fresh one.
 * The template prop may change while mounted (after Save as new); the session carries on.
 */
export function Editor({ shop, template, onSaved, onUnsavedChange, replayChips }: Props) {
  const uploads = useUploadedAssets(shop);
  const session = useSession(shop, template, { uploadedAssetNames: uploads.uploadedNames });
  // Clears itself whenever the working slip's template changes (an edit, Undo, Redo, Try again).
  const slipSelection = useSlipSelection(workingSource(session.state));
  /** Every message goes with what the seller pointed at; a question back from Flint keeps it. */
  const send = (message: string) => session.send(message, slipSelection.selection);
  const unsaved = hasUnsavedChanges(session.state);
  useEffect(() => onUnsavedChange?.(unsaved), [unsaved, onUnsavedChange]);
  // After an upload, a follow-up turn tells Flint the image is there so it carries on.
  const upload = async (file: File, name: string) => {
    const result = await uploads.upload(file, name);
    if (result.ok) send(uploadFollowUp(result.name));
    return result;
  };
  const [orderId, setOrderId] = useState(shop.defaultOrderId);
  const [codeShown, setCodeShown] = useState(false);
  // On a narrow screen the seller can fold the original away so the working slip gets the room.
  const [originalHidden, setOriginalHidden] = useState(false);
  const [zoom, setZoom] = useState(1);
  // The item-change counter, run once per working template: its line goes on the Working heading.
  const itemChanges = useItemChanges(session.state.original, workingSource(session.state), shop, uploads.assets);
  const order = shop.orders.find((o) => o.id === orderId) ?? shop.orders[0]!;
  const switchOrder = (id: string) => {
    // Another order may not have the part, so the selection clears.
    slipSelection.clear();
    setOrderId(id);
  };

  return (
    <div className={originalHidden ? "editor editor-original-hidden" : "editor"}>
      <div className="editor-toolbar">
        <SlipActions
          shop={shop}
          template={template}
          source={workingSource(session.state)}
          disabled={!!pendingTurn(session.state)}
          onSaved={(saved) => {
            session.saved();
            onSaved?.(saved);
          }}
        />
      </div>
      <div className={originalHidden ? "editor-panes editor-panes-single" : "editor-panes"}>
        {!originalHidden && (
          <SlipPane
            label="Original"
            source={session.state.original}
            shop={shop}
            order={order}
            paper={template.paper}
            assets={uploads.assets}
            zoom={zoom}
            onZoom={setZoom}
            action={
              <>
                <button type="button" className="pane-toggle" onClick={() => setOriginalHidden(true)}>
                  Hide original
                </button>
                {/* Hides with the original; the working slip keeps the order picked. */}
                <OrderPicker orders={shop.orders} orderId={order.id} onChange={switchOrder} />
              </>
            }
          />
        )}
        <SlipPane
          label="Working"
          source={workingSource(session.state)}
          shop={shop}
          order={order}
          paper={template.paper}
          assets={uploads.assets}
          pointing={{ onDocument: slipSelection.onDocument }}
          zoom={zoom}
          onZoom={setZoom}
          glowOnChange
          action={
            <>
              <SlipCodeSwitch shown={codeShown} onChange={setCodeShown} />
              {itemChanges && <WhatChanged changes={itemChanges} />}
              {originalHidden && (
                <button type="button" className="pane-toggle" onClick={() => setOriginalHidden(false)}>
                  Show original
                </button>
              )}
            </>
          }
          overlay={
            // Undo and Redo float on the working desk, and only while there's something to undo or redo.
            <div className="desk-history" role="group" aria-label="History" hidden={!canUndo(session.state) && !canRedo(session.state)}>
              <button type="button" aria-label="Undo" title="Undo" onClick={session.undo} disabled={!canUndo(session.state)}>
                ↶
              </button>
              <span className="desk-history-sep" aria-hidden="true" />
              <button type="button" aria-label="Redo" title="Redo" onClick={session.redo} disabled={!canRedo(session.state)}>
                ↷
              </button>
            </div>
          }
          cover={codeShown && <CodeView original={session.state.original} working={workingSource(session.state)} />}
        >
          {itemChanges && <ItemWarnings changes={itemChanges} />}
          <OrderHint
            original={session.state.original}
            working={workingSource(session.state)}
            shop={shop}
            order={order}
            assets={uploads.assets}
            onShowOrder={switchOrder}
          />
        </SlipPane>
      </div>
      <Chat
        turns={session.state.turns}
        thinking={session.thinking}
        onSend={send}
        retryTurnId={retryableTurn(session.state)?.id}
        onTryAgain={session.tryAgain}
        onUpload={upload}
        redoPending={session.state.redo.length > 0}
        replayChips={replayChips}
        selectionChip={slipSelection.selection ? undefined : <SelectionTip />}
        selection={slipSelection.selection && { name: slipSelection.selection.name, onClear: slipSelection.clear }}
      />
    </div>
  );
}
