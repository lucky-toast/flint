// Hand-written reference answers: for every step of every sequence, the find/replace edits a
// correct answer could make, applied to the template as it stands after the previous step.
//
// They exist to test the checks, not Ember. `--self-test` applies them with Flint's own
// applyEdits and validateTemplate, then requires each step's check to pass on its reference and
// to fail on the template before that step (so a check can't pass without the change it's
// about). `--mock` replays them as Ember's answers to exercise the whole pipeline offline.
//
// Finds are copied from src/data/templates/classic.ts and compact.ts.

const lines = (...xs) => xs.join("\n");

// ---------- C3 promo row ----------
const promoBlock = (threshold) =>
  lines(
    `      {% if order.total > ${threshold} %}`,
    "      <tr>",
    '        <td class="col-qty">1</td>',
    '        <td class="col-title">Free mystery mini planter</td>',
    '        <td class="col-sku"></td>',
    '        <td class="col-price">$0.00</td>',
    '        <td class="col-total">$0.00</td>',
    "      </tr>",
    "      {% endif %}",
    "",
  );

// ---------- K1 closing line ----------
const STUDIO_LINE = '<p class="closing">Thanks for supporting a small studio!</p>';
const NAMED_LINE = '<p class="closing">Thanks for supporting a small studio, {{ order.buyer | split: " " | first | escape }}!</p>';

// ---------- K3 prices ----------
const TOTAL_LINE = '<p class="order-total">Total: {{ order.totalFormatted }}</p>';

export const REFERENCES = {
  "C1-logo": [
    [{ find: ".logo { height: 56px; }", replace: ".logo { height: 112px; }" }],
    [{ find: ".logo { height: 112px; }", replace: ".logo { height: 84px; }" }],
    [
      {
        find: '<img class="logo" src="{{ assets.logo }}" alt="{{ shop.name | escape }}">',
        replace:
          '<div class="brand"><img class="logo" src="{{ assets.logo }}" alt="{{ shop.name | escape }}"> <img class="maker-mark" src="{{ assets.maker_mark }}" alt="Maker mark" style="height: 48px; margin-left: 8px;"></div>',
      },
    ],
  ],

  "C2-sort": [
    [{ find: '{% assign items = order.lineItems | sort: "title" %}', replace: '{% assign items = order.lineItems | sort: "quantity" | reverse %}' }],
    [
      {
        find: '{% assign items = order.lineItems | sort: "quantity" | reverse %}',
        replace: '{% assign items = order.lineItems | sort: "sku" | reverse | sort: "quantity" | reverse %}',
      },
    ],
    [
      {
        find: '{% assign items = order.lineItems | sort: "sku" | reverse | sort: "quantity" | reverse %}',
        replace: '{% assign items = order.lineItems | sort: "sku" | sort: "quantity" | reverse %}',
      },
    ],
  ],

  "C3-promo": [
    [{ find: lines("      {% endfor %}", "    </tbody>"), replace: lines("      {% endfor %}", promoBlock(200) + "    </tbody>") }],
    [{ find: "{% if order.total > 200 %}", replace: "{% if order.total > 100 %}" }],
    [
      { find: promoBlock(100), replace: "" },
      { find: lines("    <tbody>", "      {% for item in items %}"), replace: lines("    <tbody>", promoBlock(100) + "      {% for item in items %}") },
    ],
  ],

  "C4-glaze-tables": [
    [
      {
        find: lines('  {% assign items = order.lineItems | sort: "title" %}', '  <table class="items">'),
        replace: lines(
          '  {% assign items = order.lineItems | sort: "title" %}',
          '  {% assign glazes = items | group_by: "options.Glaze" %}',
          "  {% for glaze in glazes %}",
          '  <h2 class="glaze-heading">{{ glaze.name | escape }}</h2>',
          '  <table class="items">',
        ),
      },
      { find: lines("      {% for item in items %}", "      <tr>"), replace: lines("      {% for item in glaze.items %}", "      <tr>") },
      { find: lines("    </tbody>", "  </table>"), replace: lines("    </tbody>", "  </table>", "  {% endfor %}") },
    ],
    [
      {
        find: '{% assign glazes = items | group_by: "options.Glaze" %}',
        replace: '{% assign glazes = items | group_by: "options.Glaze" | sort: "name" %}',
      },
    ],
    [
      {
        find: lines("    </tbody>", "  </table>", "  {% endfor %}"),
        replace: lines(
          "    </tbody>",
          "  </table>",
          '  <p class="glaze-subtotal">{{ glaze.name | escape }} subtotal: $' + '{{ glaze.items | map: "lineTotal" | sum }}</p>',
          "  {% endfor %}",
        ),
      },
    ],
  ],

  "K1-closing-line": [
    [
      {
        find: lines("· {{ shop.name | escape }}</p>", "</div>"),
        replace: lines("· {{ shop.name | escape }}</p>", `  ${STUDIO_LINE}`, "</div>"),
      },
    ],
    [{ find: STUDIO_LINE, replace: NAMED_LINE }],
    [{ find: NAMED_LINE, replace: `{% if order.isGift %}<p class="closing">Enjoy your gift!</p>{% else %}${NAMED_LINE}{% endif %}` }],
  ],

  "K2-gift": [
    [
      { find: '        <th class="col-sku">SKU</th>', replace: '        {% unless order.isGift %}<th class="col-sku">SKU</th>{% endunless %}' },
      {
        find: '        <td class="col-sku">{{ item.sku | escape }}</td>',
        replace: '        {% unless order.isGift %}<td class="col-sku">{{ item.sku | escape }}</td>{% endunless %}',
      },
    ],
    [
      {
        find: lines('<div class="slip">', '  <header class="slip-header">'),
        replace: lines('<div class="slip">', '  {% if order.isGift %}<p class="gift-banner">A gift for you</p>{% endif %}', '  <header class="slip-header">'),
      },
    ],
    [{ find: "      <div>{{ order.buyer | escape }}</div>", replace: "      {% unless order.isGift %}<div>{{ order.buyer | escape }}</div>{% endunless %}" }],
  ],

  "K3-prices": [
    [
      { find: "  .col-sku { width: 30%;", replace: lines("  .col-price { width: 18%; text-align: right; }", "  .col-sku { width: 30%;") },
      {
        find: lines('        <th class="col-sku">SKU</th>', "      </tr>"),
        replace: lines('        <th class="col-sku">SKU</th>', '        <th class="col-price">Price</th>', "      </tr>"),
      },
      {
        find: lines('        <td class="col-sku">{{ item.sku | escape }}</td>', "      </tr>"),
        replace: lines('        <td class="col-sku">{{ item.sku | escape }}</td>', '        <td class="col-price">{{ item.lineTotalFormatted }}</td>', "      </tr>"),
      },
      { find: '  <p class="item-count">', replace: lines(`  ${TOTAL_LINE}`, '  <p class="item-count">') },
    ],
    [
      { find: '<th class="col-price">Price</th>', replace: '{% unless order.isGift %}<th class="col-price">Price</th>{% endunless %}' },
      {
        find: '<td class="col-price">{{ item.lineTotalFormatted }}</td>',
        replace: '{% unless order.isGift %}<td class="col-price">{{ item.lineTotalFormatted }}</td>{% endunless %}',
      },
      { find: `  ${TOTAL_LINE}`, replace: `  {% unless order.isGift %}${TOTAL_LINE}{% endunless %}` },
    ],
    [
      {
        find: `{% unless order.isGift %}${TOTAL_LINE}{% endunless %}`,
        replace: `{% if order.isGift %}<p class="order-total">A gift for you</p>{% else %}${TOTAL_LINE}{% endif %}`,
      },
    ],
  ],

  "K4-option-columns": [
    [
      { find: "  .col-sku { width: 30%;", replace: lines("  .col-glaze { width: 16%; }", "  .col-size { width: 14%; }", "  .col-sku { width: 30%;") },
      {
        find: '        <th class="col-sku">SKU</th>',
        replace: lines('        <th class="col-glaze">Glaze</th>', '        <th class="col-size">Size</th>', '        <th class="col-sku">SKU</th>'),
      },
      {
        find: '          <span class="item-options">{% for option in item.options %}{{ option[0] | escape }}: {{ option[1] | escape }}{% unless forloop.last %} · {% endunless %}{% endfor %}</span>\n',
        replace: "",
      },
      {
        find: '        <td class="col-sku">{{ item.sku | escape }}</td>',
        replace: lines(
          '        <td class="col-glaze">{{ item.options.Glaze | escape }}</td>',
          '        <td class="col-size">{{ item.options.Size | escape }}</td>',
          '        <td class="col-sku">{{ item.sku | escape }}</td>',
        ),
      },
    ],
    [
      { find: '\n        <th class="col-sku">SKU</th>', replace: "" },
      { find: '\n        <td class="col-sku">{{ item.sku | escape }}</td>', replace: "" },
    ],
    [
      {
        find: lines(
          '        <th class="col-qty">Qty</th>',
          '        <th class="col-title">Item</th>',
          '        <th class="col-glaze">Glaze</th>',
          '        <th class="col-size">Size</th>',
        ),
        replace: lines(
          '        <th class="col-qty">Qty</th>',
          '        <th class="col-size">Size</th>',
          '        <th class="col-title">Item</th>',
          '        <th class="col-glaze">Glaze</th>',
        ),
      },
      { find: '\n        <td class="col-size">{{ item.options.Size | escape }}</td>', replace: "" },
      {
        find: '        <td class="col-qty">{{ item.quantity }}</td>',
        replace: lines('        <td class="col-qty">{{ item.quantity }}</td>', '        <td class="col-size">{{ item.options.Size | escape }}</td>'),
      },
    ],
  ],
};
