import { useState } from "react";
import type { Shop, Template } from "../../core";
import { uploadFollowUp } from "../assets/asset-store";
import { useUploadedAssets } from "../assets/useUploadedAssets";
import { Chat } from "../chat/Chat";
import { canUndo, retryableTurn, workingSource } from "../session/session";
import { useSession } from "../session/useSession";
import { ItemChanges } from "./ItemChanges";
import { OrderPicker } from "./OrderPicker";
import { ShowCode } from "./ShowCode";
import { SlipPane } from "./SlipPane";

type Props = { shop: Shop; template: Template };

/**
 * The editor for one shop + template: the original slip pinned beside the working slip, and the
 * chat with Flint. Mount it with a key per shop + template so switching starts a fresh session.
 */
export function Editor({ shop, template }: Props) {
  const uploads = useUploadedAssets(shop);
  const session = useSession(shop, template, { uploadedAssetNames: uploads.uploadedNames });
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
      />
    </div>
  );
}
