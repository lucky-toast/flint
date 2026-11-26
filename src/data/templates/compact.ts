import type { Template } from "../../core";

// Compact (4×6), for thermal label printers: black and white, dense, no prices, big order number.
// Like Classic it starts simple: items sorted by name, one items table, no promo logic.
// The items table is full width with a fixed layout; narrow columns take percentage widths
// through column classes and the title column takes whatever is left.
const source = `<style>
  .slip { box-sizing: border-box; padding: 0.15in; font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; font-size: 8pt; line-height: 1.25; }
  .slip-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; border-bottom: 2px solid #000; padding-bottom: 4px; }
  .logo { height: 22px; filter: grayscale(1); }
  .order-number { font-size: 26pt; font-weight: bold; line-height: 1; }
  .order-meta { text-align: right; font-size: 7pt; }
  .ship-to { margin: 5px 0; }
  .ship-to h2, .gift-message h2 { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 1px; }
  .ship-to p, .gift-message p { margin: 0; }
  .gift-message { border: 1px solid #000; padding: 3px 5px; margin: 4px 0; }
  table.items { width: 100%; table-layout: fixed; border-collapse: collapse; }
  table.items th, table.items td { padding: 2px 3px; border-bottom: 1px solid #000; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
  table.items th { font-size: 7pt; text-transform: uppercase; border-bottom: 2px solid #000; }
  .col-qty { width: 12%; }
  .col-sku { width: 30%; font-family: "Courier New", monospace; font-size: 7pt; }
  table.items th.col-qty, table.items td.col-qty { text-align: center; font-weight: bold; }
  .item-options, .item-personalization { display: block; font-size: 7pt; }
  .item-count { margin-top: 4px; text-align: right; font-size: 7pt; }
</style>
<div class="slip">
  <header class="slip-header">
    <div>
      <img class="logo" src="{{ assets.logo }}" alt="{{ shop.name | escape }}">
      <div class="order-number">#{{ order.number | escape }}</div>
    </div>
    <div class="order-meta">
      <div>{{ order.date | date: "%b %-d, %Y" }}</div>
      <div>{{ order.buyer | escape }}</div>
    </div>
  </header>

  <section class="ship-to">
    <h2>Ship to</h2>
    <p>
      {{ order.shippingAddress.name | escape }}<br>
      {{ order.shippingAddress.line1 | escape }}{% if order.shippingAddress.line2 != "" %}, {{ order.shippingAddress.line2 | escape }}{% endif %}<br>
      {{ order.shippingAddress.city | escape }}{% if order.shippingAddress.region != "" %}, {{ order.shippingAddress.region | escape }}{% endif %} {{ order.shippingAddress.postalCode | escape }}, {{ order.shippingAddress.country | escape }}
    </p>
  </section>

  {% if order.isGift and order.giftMessage != "" %}
  <section class="gift-message">
    <h2>Gift message</h2>
    <p>{{ order.giftMessage | escape }}</p>
  </section>
  {% endif %}

  {% assign items = order.lineItems | sort: "title" %}
  <table class="items">
    <thead>
      <tr>
        <th class="col-qty">Qty</th>
        <th class="col-title">Item</th>
        <th class="col-sku">SKU</th>
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
      </tr>
      {% endfor %}
    </tbody>
  </table>

  <p class="item-count">{{ order.lineItems | map: "quantity" | sum }} items · {{ shop.name | escape }}</p>
</div>
`;

export const compact: Template = {
  id: "compact",
  name: "Compact",
  builtIn: true,
  paper: "4x6",
  source,
  updatedAt: "2026-11-26T00:00:00.000Z",
};
