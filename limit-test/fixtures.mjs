// Fixtures for the Muse Ember limit test: one shop, one base template,
// three orders, and the requests to score (each with an automatic check).

export const shop = { name: "Kiln & Co.", platform: "etsy" };

// Assets are referenced by name in templates; values are fake URLs.
export const assets = {
  logo: "asset://logo",
  handmade_badge: "asset://handmade_badge",
  holiday_banner: "asset://holiday_banner",
};

const money = (n) => `$${n.toFixed(2)}`;
const round = (n) => Math.round(n * 100) / 100;

function makeOrder(o) {
  const lineItems = o.lineItems.map((li) => {
    const lineTotal = round(li.unitPrice * li.quantity);
    return {
      personalization: "",
      ...li,
      unitPriceFormatted: money(li.unitPrice),
      lineTotal,
      lineTotalFormatted: money(lineTotal),
    };
  });
  const subtotal = round(lineItems.reduce((s, li) => s + li.lineTotal, 0));
  const total = round(subtotal + o.shipping);
  return {
    currency: "USD",
    isGift: false,
    giftMessage: "",
    ...o,
    lineItems,
    subtotal,
    subtotalFormatted: money(subtotal),
    shippingFormatted: money(o.shipping),
    total,
    totalFormatted: money(total),
  };
}

const address = (name, line1, city, region, postalCode, country = "US") => ({
  name, line1, line2: "", city, region, postalCode, country,
});

export const orders = {
  // A: typical order, under $200, not a gift
  A: makeOrder({
    number: "1001",
    date: "2026-11-02",
    buyer: "Marcus Lee",
    shippingAddress: address("Marcus Lee", "42 Elm St", "Portland", "OR", "97205"),
    shipping: 6,
    lineItems: [
      { title: "Speckled Mug 12oz", sku: "MUG-SPK-12", category: "Mugs", quantity: 1, unitPrice: 28, personalization: "For Dad" },
      { title: "Ramen Bowl", sku: "BWL-RMN-06", category: "Bowls", quantity: 2, unitPrice: 24 },
      { title: "Mini Succulent Planter", sku: "PLT-MINI-02", category: "Planters", quantity: 1, unitPrice: 9 },
    ],
  }),
  // B: gift order, under $200
  B: makeOrder({
    number: "1002",
    date: "2026-11-05",
    buyer: "Priya Nair",
    isGift: true,
    giftMessage: "Happy housewarming, Sam! Love, Priya",
    shippingAddress: address("Sam Ortiz", "9 Harbor Rd", "Halifax", "NS", "B3H 1A1", "CA"),
    shipping: 6,
    lineItems: [
      { title: "Blue Glaze Mug 16oz", sku: "MUG-BLU-16", category: "Mugs", quantity: 2, unitPrice: 32 },
    ],
  }),
  // C: large mixed order, over $200, three categories, quantity ties
  C: makeOrder({
    number: "1003",
    date: "2026-11-09",
    buyer: "Dana Whitfield",
    shippingAddress: address("Dana Whitfield", "1200 Market St", "Denver", "CO", "80202"),
    shipping: 12,
    lineItems: [
      { title: "Speckled Mug 12oz", sku: "MUG-SPK-12", category: "Mugs", quantity: 4, unitPrice: 28 },
      { title: "Blue Glaze Mug 16oz", sku: "MUG-BLU-16", category: "Mugs", quantity: 2, unitPrice: 32 },
      { title: "Ramen Bowl", sku: "BWL-RMN-06", category: "Bowls", quantity: 2, unitPrice: 24 },
      { title: "Dipping Bowl Set", sku: "BWL-DIP-03", category: "Bowls", quantity: 1, unitPrice: 18 },
      { title: "Hanging Planter", sku: "PLT-HNG-04", category: "Planters", quantity: 4, unitPrice: 15 },
      { title: "Mini Succulent Planter", sku: "PLT-MINI-02", category: "Planters", quantity: 6, unitPrice: 9 },
      { title: "Espresso Cup", sku: "MUG-ESP-04", category: "Mugs", quantity: 1, unitPrice: 16 },
    ],
  }),
};

export const classicTemplate = `<div class="slip">
  <header class="slip-header">
    <img class="logo" src="{{ assets.logo }}" alt="{{ shop.name }}" style="height: 48px;">
    <div class="shop-name">{{ shop.name }}</div>
  </header>

  <section class="meta">
    <div><strong>Order</strong> #{{ order.number }}</div>
    <div><strong>Date</strong> {{ order.date | date: "%b %d, %Y" }}</div>
  </section>

  <section class="ship-to">
    <h3>Ship to</h3>
    <div>{{ order.shippingAddress.name }}</div>
    <div>{{ order.shippingAddress.line1 }}</div>
    {% if order.shippingAddress.line2 != blank %}<div>{{ order.shippingAddress.line2 }}</div>{% endif %}
    <div>{{ order.shippingAddress.city }}, {{ order.shippingAddress.region }} {{ order.shippingAddress.postalCode }}</div>
    <div>{{ order.shippingAddress.country }}</div>
  </section>

  {% if order.isGift and order.giftMessage != blank %}
  <section class="gift-message">
    <h3>Gift message</h3>
    <p>{{ order.giftMessage }}</p>
  </section>
  {% endif %}

  {% assign items = order.lineItems | sort: "title" %}
  <table class="items">
    <thead>
      <tr><th>Item</th><th>SKU</th><th>Qty</th><th>Price</th></tr>
    </thead>
    <tbody>
      {% for item in items %}
      <tr>
        <td>
          {{ item.title }}
          {% if item.personalization != blank %}<div class="personalization">{{ item.personalization }}</div>{% endif %}
        </td>
        <td>{{ item.sku }}</td>
        <td>{{ item.quantity }}</td>
        <td>{{ item.lineTotalFormatted }}</td>
      </tr>
      {% endfor %}
    </tbody>
  </table>

  <section class="totals">
    <div>Subtotal: {{ order.subtotalFormatted }}</div>
    <div>Shipping: {{ order.shippingFormatted }}</div>
    <div><strong>Total: {{ order.totalFormatted }}</strong></div>
  </section>

  <footer class="thanks">Thank you for your order!</footer>
</div>
`;

export const schemaDoc = `shop.name                 string   e.g. "Kiln & Co."
shop.platform             string   "etsy" | "ebay"
assets.<name>             string   image URL for a named asset (see available assets)
order.number              string   e.g. "1003"
order.date                string   ISO date, e.g. "2026-11-09" (use the date filter to format)
order.buyer               string   buyer's name
order.isGift              boolean
order.giftMessage         string | empty   only set when isGift
order.shippingAddress     object   { name, line1, line2 (may be empty), city, region, postalCode, country }
order.subtotal            number   e.g. 372   (formatted: order.subtotalFormatted "$372.00")
order.shipping            number   e.g. 12    (formatted: order.shippingFormatted "$12.00")
order.total               number   e.g. 384   (formatted: order.totalFormatted "$384.00")
order.currency            string   "USD"
order.lineItems           array of items:
  item.title              string   e.g. "Ramen Bowl"
  item.sku                string   e.g. "BWL-RMN-06"
  item.category           string   e.g. "Bowls"
  item.quantity           number   e.g. 2
  item.unitPrice          number   (formatted: item.unitPriceFormatted)
  item.lineTotal          number   unitPrice * quantity (formatted: item.lineTotalFormatted)
  item.personalization    string | empty`;

// No filter documentation is sent to Ember: built-in Liquid behaviour is left
// unexplained unless the limit test shows Ember doesn't know it.

// ---------- helpers for checks ----------
const skuOrder = (html, skus) =>
  skus.map((s) => [s, html.indexOf(s)]).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]).map(([s]) => s);

const allSkusPresent = (html, order) => order.lineItems.every((li) => html.includes(li.sku));

// Every edit is also scored on line items: an item that goes missing from, or
// appears extra times on, any example order fails the run, unless the request
// sets `allowsItemChanges: true` (for future hide/combine/repeat requests).
export const requests = [
  {
    id: "1-logo-size",
    text: "Make the logo bigger, about twice its current size.",
    expect: "edit",
    check: ({ A }) => {
      const tag = A.match(/<img[^>]*asset:\/\/logo[^>]*>/)?.[0] ?? "";
      const nums = [...tag.matchAll(/(?:height|width)\s*[:=]\s*"?\s*(\d+)/g)].map((m) => +m[1]);
      return nums.length > 0 && Math.max(...nums) >= 80
        ? [true, "logo size >= 80px"]
        : [false, `logo tag: ${tag || "(not found)"}`];
    },
  },
  {
    id: "2-header-image",
    text: "Add our Handmade badge to the header, next to the logo.",
    expect: "edit",
    check: ({ A }) => {
      const i = A.indexOf("asset://handmade_badge");
      const h = A.indexOf("</header>");
      if (i < 0) return [false, "badge not rendered"];
      if (h >= 0 && i > h) return [false, "badge rendered outside header"];
      return [A.includes("asset://logo"), "badge in header, logo kept"];
    },
  },
  {
    id: "3-sort",
    text: "Sort the items by quantity (highest first), then by SKU.",
    expect: "edit",
    check: ({ C }) => {
      const want = ["PLT-MINI-02", "MUG-SPK-12", "PLT-HNG-04", "BWL-RMN-06", "MUG-BLU-16", "BWL-DIP-03", "MUG-ESP-04"];
      const got = skuOrder(C, want);
      return JSON.stringify(got) === JSON.stringify(want)
        ? [true, "order correct"]
        : [false, got.length ? `wrong order: ${got.join(",")}` : "no items rendered at all"];
    },
  },
  {
    id: "4-category-tables",
    text: "Instead of one big table, show a separate table for each category of item, with the category name as a heading.",
    expect: "edit",
    check: ({ C }) => {
      const tables = (C.match(/<table/g) ?? []).length;
      const cats = ["Mugs", "Bowls", "Planters"].every((c) => C.includes(c));
      const ok = tables >= 3 && cats && allSkusPresent(C, orders.C);
      return [ok, `tables=${tables} categoriesShown=${cats} allSkus=${allSkusPresent(C, orders.C)}`];
    },
  },
  {
    id: "5-promo",
    text: 'On orders over $200, add an extra line to the items table: "Free mystery mini planter", quantity 1, price $0.00.',
    expect: "edit",
    check: ({ A, B, C }) => {
      const p = /free mystery mini planter/i;
      const ok = p.test(C) && !p.test(A) && !p.test(B);
      return [ok, `C=${p.test(C)} A=${p.test(A)} B=${p.test(B)}`];
    },
  },
  {
    id: "6-gift-prices",
    text: "Hide all prices (item prices and totals) on gift orders.",
    expect: "edit",
    check: ({ A, B }) => {
      const ok = !B.includes("$") && A.includes("$") && B.includes("Blue Glaze Mug");
      return [ok, `giftHasPrice=${B.includes("$")} normalHasPrice=${A.includes("$")}`];
    },
  },
  // Behaviour checks (tool-call modes): should NOT edit.
  {
    id: "7-vague",
    text: "Make it look nicer.",
    expect: "ask_clarification",
  },
  {
    id: "8-missing-asset",
    text: "Add my new eco-friendly badge under the shop name.",
    expect: "request_asset",
  },
];
