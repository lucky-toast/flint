import type { Order } from "../../core";

type Props = { orders: Order[]; orderId: string; onChange: (orderId: string) => void };

/** Picks which example order both slips render. */
export function OrderPicker({ orders, orderId, onChange }: Props) {
  return (
    <label className="order-picker">
      <span className="order-picker-label">Example order</span>
      <select value={orderId} onChange={(e) => onChange(e.target.value)}>
        {orders.map((o) => (
          <option key={o.id} value={o.id}>
            #{o.number} · {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
