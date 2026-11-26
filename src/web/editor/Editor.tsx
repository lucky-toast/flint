import { useEffect, useState } from "react";
import type { Shop, Template } from "../../core";
import { uploadFollowUp } from "../assets/asset-store";
import { useUploadedAssets } from "../assets/useUploadedAssets";
import { Chat } from "../chat/Chat";
import { canRedo, canUndo, hasUnsavedChanges, pendingTurn, retryableTurn, workingSource } from "../session/session";
import { useSession } from "../session/useSession";
import { ItemChanges } from "./ItemChanges";
import { OrderPicker } from "./OrderPicker";
import { ShowCode } from "./ShowCode";
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
  const unsaved = hasUnsavedChanges(session.state);
  useEffect(() => onUnsavedChange?.(unsaved), [unsaved, onUnsavedChange]);
  // After an upload, a follow-up turn tells Flint the image is there so it carries on.
  const upload = async (file: File, name: string) => {
    const result = await uploads.upload(file, name);
    if (result.ok) session.send(uploadFollowUp(result.name));
    return result;
  };
  const [orderId, setOrderId] = useState(shop.defaultOrderId);
  const order = shop.orders.find((o) => o.id === orderId) ?? shop.orders[0]!;

  return (
    <div className="editor">
      <div className="editor-toolbar">
        <OrderPicker orders={shop.orders} orderId={order.id} onChange={setOrderId} />
        <button type="button" onClick={session.undo} disabled={!canUndo(session.state)}>
          Undo
        </button>
        <button type="button" onClick={session.redo} disabled={!canRedo(session.state)}>
          Redo
        </button>
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
      <div className="editor-panes">
        <SlipPane
          label="Original"
          source={session.state.original}
          shop={shop}
          order={order}
          paper={template.paper}
          assets={uploads.assets}
        />
        <SlipPane
          label="Working"
          source={workingSource(session.state)}
          shop={shop}
          order={order}
          paper={template.paper}
          assets={uploads.assets}
          footer={<ShowCode original={session.state.original} working={workingSource(session.state)} />}
        >
          <ItemChanges original={session.state.original} working={workingSource(session.state)} shop={shop} assets={uploads.assets} />
        </SlipPane>
      </div>
      <Chat
        turns={session.state.turns}
        thinking={session.thinking}
        onSend={session.send}
        retryTurnId={retryableTurn(session.state)?.id}
        onTryAgain={session.tryAgain}
        onUpload={upload}
        redoPending={session.state.redo.length > 0}
        replayChips={replayChips}
      />
    </div>
  );
}
