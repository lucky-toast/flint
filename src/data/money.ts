import type { Address, LineItem, Order } from "../core";

// Helpers for writing fixtures by hand: they fill in the totals and pre-formatted money strings
// so each fixture only states what's specific to it.

export function usd(amount: number): string {
  return `$${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

type ItemInput = Pick<LineItem, "title" | "sku" | "quantity" | "options" | "unitPrice"> & {
  personalization?: string;
};

export function item(input: ItemInput): LineItem {
  const lineTotal = input.unitPrice * input.quantity;
  return {
    title: input.title,
    sku: input.sku,
    quantity: input.quantity,
    options: input.options,
    unitPrice: input.unitPrice,
    unitPriceFormatted: usd(input.unitPrice),
    lineTotal,
    lineTotalFormatted: usd(lineTotal),
    personalization: input.personalization ?? "",
  };
}

type OrderInput = Pick<Order, "id" | "label" | "number" | "date" | "buyer" | "shipping" | "lineItems"> & {
  shippingAddress: Omit<Address, "line2" | "region"> & Partial<Pick<Address, "line2" | "region">>;
  isGift?: boolean;
  giftMessage?: string;
};

export function order(input: OrderInput): Order {
  const subtotal = input.lineItems.reduce((sum, li) => sum + li.lineTotal, 0);
  const total = subtotal + input.shipping;
  return {
    id: input.id,
    label: input.label,
    number: input.number,
    date: input.date,
    buyer: input.buyer,
    isGift: input.isGift ?? false,
    giftMessage: input.giftMessage ?? "",
    shippingAddress: { line2: "", region: "", ...input.shippingAddress },
    subtotal,
    shipping: input.shipping,
    total,
    currency: "USD",
    subtotalFormatted: usd(subtotal),
    shippingFormatted: usd(input.shipping),
    totalFormatted: usd(total),
    lineItems: input.lineItems,
  };
}
