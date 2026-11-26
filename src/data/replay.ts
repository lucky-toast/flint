import { uploadFollowUpName, type ToolName } from "../core";

// Replay mode: recorded Muse Ember responses for the scripted demo on Kiln & Co. with Classic,
// served without an access code (or when live mode is resting), so the public demo always works.
//
// The responses come from the limit-test recordings (run 2026-11-26T00-49-23, seqs 1-8, and
// 2026-11-26T00-48-12 seq 4 for grouping), adapted by hand to the shipped Classic template:
// the recorded `find` strings targeted an older template. Each entry's calls are tried in order,
// the way Ember's retries are, so an entry can carry variants for the slip with and without the
// earlier demo steps (e.g. the promo inside one table per glaze, or in the single items table).
// test/worker/replay.test.ts applies every step to Classic, in demo order, against every order.

/** Replay covers this shop's Classic slip. */
export const REPLAY_SHOP_ID = "kiln-and-co";

/** One recorded tool call: what Ember answered, as its parsed arguments. */
export type ReplayCall = { name: ToolName; arguments: Record<string, unknown> };

type ReplayEntry = {
  /** Request texts this entry answers (matched loosely: case, spacing and punctuation don't matter). */
  requests: string[];
  calls: ReplayCall[];
};

/** Stands for the uploaded image's name in the eco-badge follow-up. */
const ASSET = "__ASSET__";

const edit = (edits: { find: string; replace: string }[], summary: string): ReplayCall => ({
  name: "edit_template",
  arguments: { edits, summary },
});

// Classic's anchors, exactly as in src/data/templates/classic.ts.
const ITEMS_LOOP_END = "      {% endfor %}\n    </tbody>";
const ITEMS_TABLE_END = "    </tbody>\n  </table>\n";
const PRICE_HEADERS = '        <th class="col-price">Price</th>\n        <th class="col-total">Total</th>\n';
const PRICE_CELLS =
  '        <td class="col-price">{{ item.unitPriceFormatted }}</td>\n        <td class="col-total">{{ item.lineTotalFormatted }}</td>\n';
const LOGO = '    <img class="logo" src="{{ assets.logo }}" alt="{{ shop.name | escape }}">\n';

const promoRow = (condition: string) =>
  `      {% if ${condition} %}
      <tr class="promo-line">
        <td class="col-qty">1</td>
        <td class="col-title">Free mystery mini planter</td>
        <td class="col-sku"></td>
        <td class="col-price">$0.00</td>
        <td class="col-total">$0.00</td>
      </tr>
      {% endif %}
`;
const PROMO_PRICES = '        <td class="col-price">$0.00</td>\n        <td class="col-total">$0.00</td>\n';

const unlessGift = (block: string) => `        {% unless order.isGift %}\n${block}        {% endunless %}\n`;

const PROMO_SUMMARY = "Added a free mystery mini planter line for orders over $200 🎁";
const GIFT_PRICES_SUMMARY = "Hid the prices and totals on gift orders 🎁";

const giftPriceEdits = [
  { find: PRICE_HEADERS, replace: unlessGift(PRICE_HEADERS) },
  { find: PRICE_CELLS, replace: unlessGift(PRICE_CELLS) },
  { find: '  <table class="totals">\n', replace: '  {% unless order.isGift %}\n  <table class="totals">\n' },
  {
    find: '<tr class="grand-total"><td>Total</td><td>{{ order.totalFormatted }}</td></tr>\n  </table>\n',
    replace: '<tr class="grand-total"><td>Total</td><td>{{ order.totalFormatted }}</td></tr>\n  </table>\n  {% endunless %}\n',
  },
];

const entries: ReplayEntry[] = [
  {
    requests: ["Sort items by quantity, then SKU", "Sort the items by quantity (highest first), then by SKU"],
    calls: [
      edit(
        [
          {
            find: '{% assign items = order.lineItems | sort: "title" %}',
            replace: '{% assign items = order.lineItems | sort: "sku" | reverse | sort: "quantity" | reverse %}',
          },
        ],
        "Sorted line items by quantity (highest first), then SKU.",
      ),
    ],
  },
  {
    requests: ["A table per glaze", "Put each glaze in its own table"],
    calls: [
      edit(
        [
          {
            find: '  <table class="items">\n',
            replace:
              '  {% assign glazes = items | group_by: "options.Glaze" %}\n  {% for glaze in glazes %}\n  <h3 class="glaze-heading">{{ glaze.name | escape }}</h3>\n  <table class="items">\n',
          },
          { find: "{% for item in items %}", replace: "{% for item in glaze.items %}" },
          { find: ITEMS_TABLE_END, replace: `${ITEMS_TABLE_END}  {% endfor %}\n` },
          {
            find: "  .item-options, .item-personalization {",
            replace:
              "  .glaze-heading { font-size: 12pt; margin: 18px 0 0; color: #b5532f; }\n  .item-options, .item-personalization {",
          },
        ],
        "Split the items into one table per glaze, with the glaze name as a heading.",
      ),
    ],
  },
  {
    requests: ["Free mini planter on orders over $200", "On orders over $200, add a free mystery mini planter line"],
    calls: [
      // One table per glaze: the line goes once, at the end of the last table.
      edit(
        [
          {
            find: `${ITEMS_LOOP_END}\n  </table>\n  {% endfor %}`,
            replace: `      {% endfor %}\n${promoRow("forloop.last and order.total > 200")}    </tbody>\n  </table>\n  {% endfor %}`,
          },
        ],
        PROMO_SUMMARY,
      ),
      // The single items table.
      edit([{ find: ITEMS_LOOP_END, replace: `      {% endfor %}\n${promoRow("order.total > 200")}    </tbody>` }], PROMO_SUMMARY),
    ],
  },
  {
    requests: ["Hide prices on gift orders", "Hide all prices (item prices and totals) on gift orders"],
    calls: [
      // With the promo line, its $0.00 prices are hidden too.
      edit([...giftPriceEdits, { find: PROMO_PRICES, replace: unlessGift(PROMO_PRICES) }], GIFT_PRICES_SUMMARY),
      edit(giftPriceEdits, GIFT_PRICES_SUMMARY),
    ],
  },
  {
    // No recording: Classic already prints the gift message, so this makes it stand out instead.
    // The box only renders on gift orders with a message.
    requests: ["Make the gift message stand out", "Make the gift message stand out on gift orders"],
    calls: [
      edit(
        [
          {
            find: "  .gift-message { flex: 1; border: 1px dashed #b5532f; padding: 10px 14px; font-style: italic; }",
            replace:
              "  .gift-message { flex: 1; border: 2px solid #b5532f; border-radius: 8px; background: #fbeee6; padding: 14px 18px; font-style: italic; font-size: 13pt; }",
          },
        ],
        "Put the gift message in a highlighted note box on gift orders 🎁",
      ),
    ],
  },
  {
    requests: ["Add my eco-friendly badge under the shop name", "Add my new eco-friendly badge under the shop name"],
    calls: [{ name: "request_asset", arguments: { description: "Your new eco-friendly badge image to place under the shop name" } }],
  },
  {
    requests: ["Make it look nicer"],
    calls: [
      {
        name: "ask_clarification",
        arguments: {
          question: "Happy to! What would you like me to change first? ✨",
          options: ["Bigger logo", "Make the gift message stand out"],
        },
      },
    ],
  },
  {
    requests: ["Make the logo bigger", "Bigger logo", "Make the logo bigger, about twice its current size"],
    calls: [
      edit([{ find: ".logo { height: 56px; }", replace: ".logo { height: 112px; }" }], "Made the logo twice as big (56px → 112px)."),
    ],
  },
];

// After the seller uploads the badge, the follow-up turn (uploadFollowUp) names it; the edit uses that name.
const ecoBadgeCalls: ReplayCall[] = [
  edit(
    [
      {
        find: LOGO,
        replace: `    <div class="brand">\n  ${LOGO}      <img class="eco-badge" src="{{ assets.${ASSET} }}" alt="Eco-friendly">\n    </div>\n`,
      },
      {
        find: "  .order-details {",
        replace:
          "  .brand { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }\n  .eco-badge { height: 36px; }\n  .order-details {",
      },
    ],
    "Added your eco-friendly badge under the shop name 🌱",
  ),
];

/** The suggestion chips replay mode offers, in demo order. Each one is a replayable request. */
export const REPLAY_CHIPS: string[] = entries.map((e) => e.requests[0]!);

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}$]+/gu, " ").trim();
}

const byRequest = new Map(entries.flatMap((e) => e.requests.map((r) => [normalize(r), e.calls] as const)));

/** The recorded calls for a seller message, if replay has them. */
export function findReplay(message: string): ReplayCall[] | undefined {
  const name = uploadFollowUpName(message);
  if (name) {
    return ecoBadgeCalls.map((call) => JSON.parse(JSON.stringify(call).replaceAll(ASSET, name)) as ReplayCall);
  }
  return byRequest.get(normalize(message));
}
