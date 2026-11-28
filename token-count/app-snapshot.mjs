// A hand-copied snapshot of what Flint sends Ember for one turn, taken from main at 881e027.
// Nothing here imports the app: if the app's prompt, tools or request settings change, update
// this file by hand from the sources named on each section.

// ---------------- src/core/ember.ts (requestBody) ----------------
export const EMBER_MODEL = "muse-ember-1.0";
export const MAX_OUTPUT_TOKENS = 4000;

/** The request body the app sends, with `input` left for the caller. */
export function requestBody({ instructions, input, tools }) {
  return {
    model: EMBER_MODEL,
    instructions,
    tools,
    tool_choice: "auto",
    parallel_tool_calls: false,
    reasoning: { effort: "low" },
    max_output_tokens: MAX_OUTPUT_TOKENS,
    store: false,
    include: ["reasoning.encrypted_content"],
    input,
  };
}

// ---------------- src/core/turn.ts ----------------
export const MAX_ATTEMPTS = 3;
export const TEXT_ON_RETRY_NUDGE =
  "You replied with text but did not call edit_template, so nothing changed. Call edit_template now with the fix. Do not reply with text.";
export const editRejection = (error) =>
  `Edit rejected: ${error}. The template is unchanged. Fix the problem and call edit_template again.`;
export const toolRejection = (name, error) =>
  `${name} call rejected: ${error}. The template is unchanged. Call exactly one tool again with valid arguments.`;

// ---------------- src/core/tools.ts ----------------
export const TOOLS = [
  {
    type: "function",
    name: "edit_template",
    description:
      "Edit the current template with exact find/replace operations, applied in order. Each `find` must match the current template exactly once (copy it character for character, including whitespace).",
    parameters: {
      type: "object",
      properties: {
        edits: {
          type: "array",
          items: {
            type: "object",
            properties: { find: { type: "string" }, replace: { type: "string" } },
            required: ["find", "replace"],
            additionalProperties: false,
          },
        },
        summary: { type: "string", description: "One short, friendly line describing the change" },
      },
      required: ["edits", "summary"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "ask_clarification",
    description:
      "Ask the seller a question when the request is vague, could mean very different things, or is too big for one edit (then suggest the steps as options).",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "One short, friendly question" },
        options: {
          type: "array",
          items: { type: "string" },
          description: "2-4 short suggested answers",
        },
      },
      required: ["question"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "request_asset",
    description: "Ask the seller to upload an image the request needs that isn't in the available assets.",
    parameters: {
      type: "object",
      properties: {
        description: { type: "string", description: "What image is needed, in one short friendly line" },
      },
      required: ["description"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "reply",
    description:
      "Reply briefly when the request is out of scope or small talk, offering the closest thing you can do in the template.",
    parameters: {
      type: "object",
      properties: { message: { type: "string", description: "One or two short, friendly lines" } },
      required: ["message"],
      additionalProperties: false,
    },
  },
];

// ---------------- src/core/prompt.ts ----------------
export const SCHEMA_DOC = `shop: { name: string ("Maple Studio"), platform: "etsy" | "ebay" }
assets: { <name>: string } (image URLs; use as <img src="{{ assets.<name> }}">; only the names listed below exist)
order: {
  number: string ("1003")
  date: string (ISO date, "2026-11-08"; print with the date filter)
  buyer: string ("Ana Reyes")
  isGift: boolean (true)
  giftMessage: string ("Happy birthday!") — may be empty
  shippingAddress: {
    name: string ("Ana Reyes"), line1: string ("88 Mission St"),
    line2: string ("Suite 400") — may be empty,
    city: string ("San Francisco"), region: string ("CA") — may be empty,
    postalCode: string ("94103"), country: string ("United States")
  }
  subtotal: number (474), shipping: number (18), total: number (492) — raw numbers, for comparisons
  currency: string ("USD")
  subtotalFormatted: string ("$474.00"), shippingFormatted: string ("$18.00"), totalFormatted: string ("$492.00") — for printing
  lineItems: array of {
    title: string ("Everyday Mug")
    sku: string ("MUG-12-SPK")
    quantity: number (2)
    options: { <option name>: string } ({ "Glaze": "Speckled", "Size": "12 oz" }; every item in a shop has the same option names)
    unitPrice: number (34), unitPriceFormatted: string ("$34.00")
    lineTotal: number (68), lineTotalFormatted: string ("$68.00")
    personalization: string ("Letter M on the handle") — may be empty
  }
}`;

function optionNames(shop) {
  const first = shop.orders.flatMap((o) => o.lineItems)[0];
  return first ? Object.keys(first.options) : [];
}

export function buildInstructions(shop) {
  const assets = Object.keys(shop.assets).map((name) => `assets.${name}`).join(", ");
  const options = optionNames(shop);
  return `You are Flint, a cheerful, brief helper inside a packing-slip editor. Sellers who don't know code ask you to change their packing-slip template, which is written in Liquid (LiquidJS, built-in tags and filters only, strict variables and strict filters). You change the template by calling tools. Never show code to the seller; your summaries, questions and replies are one short, friendly line with a light emoji at most.

Rules:
- Always call exactly one tool.
- Make the smallest change that does what the seller asked. Don't restyle or reorganize anything else.
- Prefer the simplest change: chain filters rather than adding loops, and never hard-code numeric limits like (1..1000).
- Every line item must still appear on the slip unless the seller asked to hide or combine items.
- If the request is vague or could mean very different things, call ask_clarification instead of guessing. If it is too big for one edit, call ask_clarification and offer the steps as options.
- If the request needs an image that isn't in the available assets, call request_asset.
- If the request is out of scope or small talk, call reply and offer the closest thing you can do in the template.
- Fields marked "may be empty" can be blank (""), so guard them with {% if field != "" %}.
- Liquid ranges only count up, so (5..1) produces nothing. To count down, loop over (1..5) with reversed.

Template data:
${SCHEMA_DOC}

This shop: ${shop.name} (${shop.platform}). Line item option names: ${options.length ? options.map((o) => `"${o}"`).join(", ") : "none"}.
Available assets: ${assets}, plus any images the seller uploaded, which the request lists.

How to edit: call edit_template with edits applied in order. Each find must be copied character for character from the current template (including whitespace) and match it exactly once; include enough surrounding text to make it unique. Your edit is checked by rendering every example order; if it is rejected you will be told why, and the template stays unchanged.`;
}

/** The first turn's user message text (no history, no uploads, no selection, no retry hint). */
export function buildUserMessage({ templateSource, message }) {
  return [`Current template:\n\`\`\`liquid\n${templateSource}\n\`\`\``, `Request: ${message}`].join("\n\n");
}

// ---------------- src/core/edits.ts ----------------
function countOccurrences(haystack, needle) {
  let count = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) count++;
  return count;
}

export function applyEdits(source, edits) {
  if (edits.length === 0) return { ok: false, error: "no edits were given" };
  let current = source;
  for (const [i, { find, replace }] of edits.entries()) {
    const label = `edit ${i + 1}`;
    if (find === "") return { ok: false, error: `${label}: \`find\` is empty` };
    const matches = countOccurrences(current, find);
    if (matches === 0) {
      return { ok: false, error: `${label}: \`find\` text was not found in the template; copy it exactly from the current template` };
    }
    if (matches > 1) {
      return { ok: false, error: `${label}: \`find\` text matches ${matches} places; make it longer so it is unique` };
    }
    const at = current.indexOf(find);
    current = current.slice(0, at) + replace + current.slice(at + find.length);
  }
  return { ok: true, source: current };
}

// ---------------- src/core/liquid.ts + validate.ts ----------------
export const LIQUID_OPTIONS = {
  strictFilters: true,
  strictVariables: true,
  ownPropertyOnly: true,
  timezoneOffset: 0,
  renderLimit: 1000,
  memoryLimit: 10_000_000,
};
export const PLACEHOLDER_IMAGE = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
export const renderContext = (shop, order, assets = shop.assets) => ({
  shop: { name: shop.name, platform: shop.platform },
  assets,
  order,
});

// ---------------- src/core/pricing.ts (muse-ember-1.0, USD per token) ----------------
export const USD_PER_INPUT_TOKEN = 0.1e-6;
export const USD_PER_CACHED_INPUT_TOKEN = 0.004e-6;
export const USD_PER_OUTPUT_TOKEN = 0.5e-6;

/** What one call cost. Cached tokens are part of input_tokens. */
export function costUsd({ input_tokens = 0, cached = 0, output_tokens = 0 }) {
  const c = Math.min(cached, input_tokens);
  return (input_tokens - c) * USD_PER_INPUT_TOKEN + c * USD_PER_CACHED_INPUT_TOKEN + output_tokens * USD_PER_OUTPUT_TOKEN;
}

// ---------------- src/data/money.ts + src/data/svg.ts ----------------
const usd = (amount) => `$${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
const svgDataUrl = (svg) => `data:image/svg+xml,${encodeURIComponent(svg.trim())}`;

function item(input) {
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

function order(input) {
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

// ---------------- src/data/shops/kiln-and-co.ts (the app's default shop, shops[0]) ----------------
const logo = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 64">
  <circle cx="32" cy="32" r="26" fill="#b5532f"/>
  <path d="M20 42 Q32 14 44 42 Z" fill="#f6e7d8"/>
  <text x="70" y="41" font-family="Georgia, serif" font-size="26" fill="#3b2a22">Kiln &amp; Co.</text>
</svg>`);

const makerMark = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="29" fill="none" stroke="#3b2a22" stroke-width="3"/>
  <text x="32" y="38" text-anchor="middle" font-family="Georgia, serif" font-size="16" fill="#3b2a22">K&amp;C</text>
</svg>`);

const careIcon = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="8" y="14" width="48" height="36" rx="6" fill="none" stroke="#3b2a22" stroke-width="3"/>
  <path d="M18 26 h28 M18 34 h28 M18 42 h18" stroke="#3b2a22" stroke-width="3"/>
</svg>`);

export const SHOP = {
  id: "kiln-and-co",
  name: "Kiln & Co.",
  platform: "etsy",
  assets: { logo, maker_mark: makerMark, care_icon: careIcon },
  defaultOrderId: "kiln-1003",
  orders: [
    order({
      id: "kiln-1001",
      label: "Typical order",
      number: "1001",
      date: "2026-11-02",
      buyer: "Priya Shah",
      shipping: 8.5,
      shippingAddress: {
        name: "Priya Shah",
        line1: "214 Alder Street",
        line2: "Apt 3B",
        city: "Portland",
        region: "OR",
        postalCode: "97205",
        country: "United States",
      },
      lineItems: [
        item({ title: "Everyday Mug", sku: "MUG-12-SPK", quantity: 2, options: { Glaze: "Speckled", Size: "12 oz" }, unitPrice: 34 }),
        item({ title: "Ramen Bowl", sku: "BWL-RMN-CEL", quantity: 1, options: { Glaze: "Celadon", Size: "Large" }, unitPrice: 48 }),
      ],
    }),
    order({
      id: "kiln-1002",
      label: "Gift order",
      number: "1002",
      date: "2026-11-05",
      buyer: "Daniel Okafor",
      isGift: true,
      giftMessage: "Happy birthday, Mira! Fill this with something warm. Love, Dan",
      shipping: 6,
      shippingAddress: {
        name: "Mira Okafor",
        line1: "9 Willow Lane",
        city: "Asheville",
        region: "NC",
        postalCode: "28801",
        country: "United States",
      },
      lineItems: [
        item({
          title: "Initial Mug",
          sku: "MUG-16-SHN",
          quantity: 1,
          options: { Glaze: "Shino", Size: "16 oz" },
          unitPrice: 42,
          personalization: "Letter M on the handle side",
        }),
        item({ title: "Tea Bag Rest", sku: "RST-TEA-SHN", quantity: 1, options: { Glaze: "Shino", Size: "Small" }, unitPrice: 14 }),
      ],
    }),
    order({
      id: "kiln-1003",
      label: "Large mixed order",
      number: "1003",
      date: "2026-11-08",
      buyer: "Hannah Lindqvist",
      shipping: 18,
      shippingAddress: {
        name: "Hannah Lindqvist",
        line1: "77 Market Street",
        line2: "Suite 400",
        city: "San Francisco",
        region: "CA",
        postalCode: "94103",
        country: "United States",
      },
      lineItems: [
        item({ title: "Everyday Mug", sku: "MUG-12-TNM", quantity: 4, options: { Glaze: "Tenmoku", Size: "12 oz" }, unitPrice: 34 }),
        item({ title: "Dinner Plate", sku: "PLT-DIN-CEL", quantity: 2, options: { Glaze: "Celadon", Size: "Large" }, unitPrice: 36 }),
        item({ title: "Side Plate", sku: "PLT-SID-CEL", quantity: 2, options: { Glaze: "Celadon", Size: "Small" }, unitPrice: 24 }),
        item({ title: "Bud Vase", sku: "VAS-BUD-SPK", quantity: 1, options: { Glaze: "Speckled", Size: "Small" }, unitPrice: 28 }),
        item({ title: "Serving Bowl", sku: "BWL-SRV-SPK", quantity: 1, options: { Glaze: "Speckled", Size: "Large" }, unitPrice: 72 }),
        item({ title: "Ramen Bowl", sku: "BWL-RMN-TNM", quantity: 2, options: { Glaze: "Tenmoku", Size: "Large" }, unitPrice: 48 }),
        item({ title: "Mini Planter", sku: "PLN-MIN-SHN", quantity: 1, options: { Glaze: "Shino", Size: "Small" }, unitPrice: 22 }),
      ],
    }),
    order({
      id: "kiln-1004",
      label: "Over $200",
      number: "1004",
      date: "2026-11-11",
      buyer: "Marcus Bell",
      shipping: 24,
      shippingAddress: {
        name: "Marcus Bell",
        line1: "1600 Elm Avenue",
        city: "Chicago",
        region: "IL",
        postalCode: "60614",
        country: "United States",
      },
      lineItems: [
        item({ title: "Dinnerware Set for Four", sku: "SET-DIN-4-MWH", quantity: 1, options: { Glaze: "Matte White", Size: "Set of 4" }, unitPrice: 240 }),
        item({ title: "Serving Bowl", sku: "BWL-SRV-MWH", quantity: 1, options: { Glaze: "Matte White", Size: "Large" }, unitPrice: 72 }),
      ],
    }),
    order({
      id: "kiln-1005",
      label: "Single item",
      number: "1005",
      date: "2026-11-14",
      buyer: "Lee Tran",
      shipping: 5,
      shippingAddress: {
        name: "Lee Tran",
        line1: "48 Harbor Road",
        city: "Providence",
        region: "RI",
        postalCode: "02903",
        country: "United States",
      },
      lineItems: [
        item({ title: "Bud Vase", sku: "VAS-BUD-CEL", quantity: 1, options: { Glaze: "Celadon", Size: "Small" }, unitPrice: 28 }),
      ],
    }),
    order({
      id: "kiln-1006",
      label: "International order",
      number: "1006",
      date: "2026-11-17",
      buyer: "Maximiliane von Hohenstein-Brandenburg",
      shipping: 32,
      shippingAddress: {
        name: "Maximiliane von Hohenstein-Brandenburg",
        line1: "Kurfürstendamm 195, Hinterhaus, 4. Obergeschoss",
        city: "Berlin",
        postalCode: "10707",
        country: "Germany",
      },
      lineItems: [
        item({
          title: "Extra Large Hand-Thrown Stoneware Fruit Bowl with Carved Rim",
          sku: "BWL-FRT-XL-TNM",
          quantity: 1,
          options: { Glaze: "Tenmoku", Size: "Extra Large" },
          unitPrice: 110,
        }),
        item({ title: "Everyday Mug", sku: "MUG-12-MWH", quantity: 1, options: { Glaze: "Matte White", Size: "12 oz" }, unitPrice: 34 }),
      ],
    }),
  ],
};

// ---------------- src/data/templates/classic.ts (the app's default template, builtInTemplates[0]) ----------------
export const TEMPLATE_NAME = "Classic";
export const TEMPLATE_SOURCE = `<style>
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
