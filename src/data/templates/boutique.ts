import type { Template } from "../../core";

// Boutique (Letter): a script heading, everything centered, and a personal-note box that holds the
// gift message on gift orders and a short note from the shop otherwise.
// Like Classic it starts simple: items sorted by name, one items table, prices shown, no promo logic.
// The items table is full width with a fixed layout; narrow columns take percentage widths
// through column classes and the title column takes whatever is left.
const source = `<style>
  .slip { box-sizing: border-box; padding: 0.5in 0.7in; font-family: "Palatino Linotype", Palatino, Georgia, serif; color: #3a2e39; font-size: 11pt; text-align: center; }
  .logo { height: 44px; }
  .script-heading { font-family: "Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive; font-weight: normal; font-size: 30pt; margin: 6px 0 2px; color: #8c4a6b; }
  .order-details { font-size: 10pt; letter-spacing: 0.04em; color: #6e5f6c; }
  .ornament { margin: 12px auto; width: 40%; border: none; border-top: 1px solid #c9a9bb; }
  .ship-to h2, .personal-note h2 { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.14em; margin: 0 0 6px; color: #8c4a6b; font-weight: normal; }
  .ship-to p { margin: 0; line-height: 1.4; }
  .personal-note { margin: 14px auto; width: 70%; border: 1px solid #c9a9bb; border-radius: 10px; padding: 10px 18px; background: #fbf6f9; }
  .personal-note p { margin: 0; font-style: italic; line-height: 1.5; }
  table.items { width: 100%; table-layout: fixed; border-collapse: collapse; margin-top: 8px; }
  table.items th, table.items td { padding: 5px 6px; border-bottom: 1px solid #eadde5; text-align: center; vertical-align: top; overflow-wrap: anywhere; }
  table.items th { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.1em; font-weight: normal; color: #8c4a6b; }
  .col-qty { width: 8%; }
  .col-sku { width: 20%; font-size: 9pt; color: #6e5f6c; }
  .col-price { width: 13%; }
  .col-total { width: 13%; }
  .item-options, .item-personalization { display: block; font-size: 9pt; color: #6e5f6c; }
  .totals { margin: 16px auto 0; border-collapse: collapse; }
  .totals td { padding: 3px 12px; }
  .totals td:first-child { text-align: right; color: #6e5f6c; }
  .totals td:last-child { text-align: left; }
  .totals .grand-total td { font-weight: bold; border-top: 1px solid #c9a9bb; padding-top: 6px; }
  .sign-off { margin: 18px 0 0; font-family: "Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive; font-size: 20pt; color: #8c4a6b; }
</style>
<div class="slip">
  <img class="logo" src="{{ assets.logo }}" alt="{{ shop.name | escape }}">
  <h1 class="script-heading">Thank you, {{ order.buyer | escape }}</h1>
  <div class="order-details">Order #{{ order.number | escape }} · {{ order.date | date: "%B %-d, %Y" }}</div>

  <hr class="ornament">

  <section class="ship-to">
    <h2>Ship to</h2>
    <p>
      {{ order.shippingAddress.name | escape }}<br>
      {{ order.shippingAddress.line1 | escape }}<br>
      {% if order.shippingAddress.line2 != "" %}{{ order.shippingAddress.line2 | escape }}<br>{% endif %}
      {{ order.shippingAddress.city | escape }}{% if order.shippingAddress.region != "" %}, {{ order.shippingAddress.region | escape }}{% endif %} {{ order.shippingAddress.postalCode | escape }}<br>
      {{ order.shippingAddress.country | escape }}
    </p>
  </section>

  <section class="personal-note">
    {% if order.isGift and order.giftMessage != "" %}
    <h2>A note for you</h2>
    <p>{{ order.giftMessage | escape }}</p>
    {% else %}
    <h2>A personal note</h2>
    <p>We picked, wrapped and packed this order just for you. We hope it makes your day a little brighter.</p>
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

  <p class="sign-off">With love, {{ shop.name | escape }}</p>
</div>
`;

export const boutique: Template = {
  id: "boutique",
  name: "Boutique",
  builtIn: true,
  paper: "letter",
  source,
  updatedAt: "2026-11-26T00:00:00.000Z",
};
