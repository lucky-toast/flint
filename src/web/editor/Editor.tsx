import { useState } from "react";
import type { Shop, Template } from "../../core";
import { Chat } from "../chat/Chat";
import { canUndo, retryableTurn, workingSource } from "../session/session";
import { useSession } from "../session/useSession";
import { OrderPicker } from "./OrderPicker";
import { SlipPane } from "./SlipPane";

type Props = { shop: Shop; template: Template };

/**
 * The editor for one shop + template: the original slip pinned beside the working slip, and the
 * chat with Flint. Mount it with a key per shop + template so switching starts a fresh session.
 */
export function Editor({ shop, template }: Props) {
  const session = useSession(shop, template);
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
        <SlipPane label="Original" source={session.state.original} shop={shop} order={order} paper={template.paper} />
        <SlipPane label="Working" source={workingSource(session.state)} shop={shop} order={order} paper={template.paper} />
      </div>
      <Chat
        turns={session.state.turns}
        thinking={session.thinking}
        onSend={session.send}
        retryTurnId={retryableTurn(session.state)?.id}
        onTryAgain={session.tryAgain}
      />
    </div>
  );
}
