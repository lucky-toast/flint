import type { Template } from "../../core";

// Classic (Letter/A4), the demo template. It starts simple and leaves room for the demo edits:
// items sorted by name, one items table, prices shown, no promo logic.
// The items table is full width with a fixed layout; narrow columns take percentage widths
// through column classes and the title column takes whatever is left.
const source = `<style>
  .slip { box-sizing: border-box; padding: 0.6in; font-family: Georgia, "Times New Roman", serif; color: #2b211c; font-size: 11pt; }
  .slip-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #2b211c; padding-bottom: 12px; }
  .logo { height: 56px; }
  .order-details { text-align: right; font-size: 10pt; line-height: 1.5; }
  .order-number { font-size: 16pt; font-weight: bold; }
  .addresses { display: flex; gap: 32px; margin: 20px 0; }
  .ship-to h2, .gift-message h2 { font-size: 10pt; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 6px; }
  .ship-to p { margin: 0; line-height: 1.45; }
  .gift-message { flex: 1; border: 1px dashed #b5532f; padding: 10px 14px; font-style: italic; }
  .gift-message p { margin: 0; }
  table.items { width: 100%; table-layout: fixed; border-collapse: collapse; margin-top: 8px; }
  table.items th, table.items td { padding: 7px 6px; border-bottom: 1px solid #d9cfc7; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
  table.items th { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 2px solid #2b211c; }
  .col-qty { width: 8%; text-align: center; }
  .col-sku { width: 20%; font-family: "Courier New", monospace; font-size: 9pt; }
  .col-price { width: 13%; text-align: right; }
  .col-total { width: 13%; text-align: right; }
  table.items th.col-qty, table.items td.col-qty { text-align: center; }
  table.items th.col-price, table.items td.col-price, table.items th.col-total, table.items td.col-total { text-align: right; }
  .item-options, .item-personalization { display: block; font-size: 9pt; color: #6b5a50; }
  .totals { margin: 16px 0 0 auto; width: 40%; border-collapse: collapse; }
  .totals td { padding: 4px 6px; text-align: right; }
  .totals .grand-total td { font-weight: bold; border-top: 2px solid #2b211c; }
  .thank-you { margin-top: 32px; text-align: center; font-style: italic; }
</style>
<div class="slip">
  <header class="slip-header">
    <img class="logo" src="{{ assets.logo }}" alt="{{ shop.name | escape }}">
    <div class="order-details">
      <div class="order-number">Order #{{ order.number | escape }}</div>
      <div>{{ order.date | date: "%B %-d, %Y" }}</div>
      <div>Buyer: {{ order.buyer | escape }}</div>
    </div>
  </header>

  <section class="addresses">
    <div class="ship-to">
      <h2>Ship to</h2>
      <p>
        {{ order.shippingAddress.name | escape }}<br>
        {{ order.shippingAddress.line1 | escape }}<br>
        {% if order.shippingAddress.line2 != "" %}{{ order.shippingAddress.line2 | escape }}<br>{% endif %}
        {{ order.shippingAddress.city | escape }}{% if order.shippingAddress.region != "" %}, {{ order.shippingAddress.region | escape }}{% endif %} {{ order.shippingAddress.postalCode | escape }}<br>
        {{ order.shippingAddress.country | escape }}
      </p>
    </div>
    {% if order.isGift and order.giftMessage != "" %}
    <div class="gift-message">
      <h2>Gift message</h2>
      <p>{{ order.giftMessage | escape }}</p>
    </div>
    {% endif %}
  </section>

  {% assign items = order.lineItems | sort: "title" %}
  <table class="items">
    <thead>
      <tr>
        <th class="col-qty">Qty</th>
        <th class="col-title">Item</th>
        <th class="col-sku">SKU</th>
        <th class="col-price">Price</th>
        <th class="col-total">Total</th>
      </tr>
    </thead>
    <tbody>
      {% for item in items %}
      <tr>
        <td class="col-qty">{{ item.quantity }}</td>
        <td class="col-title">
          {{ item.title | escape }}
          <span class="item-options">{% for option in item.options %}{{ option[0] | escape }}: {{ option[1] | escape }}{% unless forloop.last %} · {% endunless %}{% endfor %}</span>
          {% if item.personalization != "" %}<span class="item-personalization">Personalization: {{ item.personalization | escape }}</span>{% endif %}
        </td>
        <td class="col-sku">{{ item.sku | escape }}</td>
        <td class="col-price">{{ item.unitPriceFormatted }}</td>
        <td class="col-total">{{ item.lineTotalFormatted }}</td>
      </tr>
      {% endfor %}
    </tbody>
  </table>

  <table class="totals">
    <tr><td>Subtotal</td><td>{{ order.subtotalFormatted }}</td></tr>
    <tr><td>Shipping</td><td>{{ order.shippingFormatted }}</td></tr>
    <tr class="grand-total"><td>Total</td><td>{{ order.totalFormatted }}</td></tr>
  </table>

  <p class="thank-you">Thank you for supporting {{ shop.name | escape }}. Every piece is made by hand, so no two are quite alike.</p>
</div>
`;

export const classic: Template = {
  id: "classic",
  name: "Classic",
  builtIn: true,
  paper: "letter",
  source,
  updatedAt: "2026-11-26T00:00:00.000Z",
};
