import { useEffect, useState } from "react";
import type { Shop, Template } from "../../core";
import { uploadFollowUp } from "../assets/asset-store";
import { useUploadedAssets } from "../assets/useUploadedAssets";
import { Chat } from "../chat/Chat";
import { SelectionChip } from "../chat/SelectionChip";
import { useSlipSelection } from "../selection/useSlipSelection";
import { canRedo, canUndo, hasUnsavedChanges, pendingTurn, retryableTurn, workingSource } from "../session/session";
import { useSession } from "../session/useSession";
import { ItemChanges } from "./ItemChanges";
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
  const order = shop.orders.find((o) => o.id === orderId) ?? shop.orders[0]!;
  const switchOrder = (id: string) => {
    // Another order may not have the part, so the selection clears.
    slipSelection.clear();
    setOrderId(id);
  };

  return (
    <div className="editor">
      <div className="editor-toolbar">
        <OrderPicker orders={shop.orders} orderId={order.id} onChange={switchOrder} />
        <div className="undo-redo" role="group" aria-label="History">
          <button type="button" onClick={session.undo} disabled={!canUndo(session.state)} title="Undo Flint's last edit">
            <span aria-hidden="true">↶</span> Undo
          </button>
          <button type="button" onClick={session.redo} disabled={!canRedo(session.state)} title="Redo the edit you undid">
            Redo <span aria-hidden="true">↷</span>
          </button>
        </div>
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
              <button type="button" className="pane-toggle" onClick={() => setOriginalHidden(true)}>
                Hide original
              </button>
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
              {originalHidden && (
                <button type="button" className="pane-toggle" onClick={() => setOriginalHidden(false)}>
                  Show original
                </button>
              )}
            </>
          }
          cover={codeShown && <CodeView original={session.state.original} working={workingSource(session.state)} />}
        >
          <ItemChanges original={session.state.original} working={workingSource(session.state)} shop={shop} assets={uploads.assets} />
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
        selectionChip={
          <SelectionChip
            name={slipSelection.selection?.name}
            copies={slipSelection.copies}
            canSelectBigger={slipSelection.canSelectBigger}
            onSelectBigger={slipSelection.selectBigger}
            onClear={slipSelection.clear}
          />
        }
      />
    </div>
  );
}
