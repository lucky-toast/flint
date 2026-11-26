import { describe, expect, it } from "vitest";
import { renderSlip } from "../../src/core";
import { builtInTemplates, defaultOrder, shops } from "../../src/data";

// Runs inside the Workers runtime, the same Core environment the Worker validates edits with.

const SPEC_ORDER_LABELS = [
  "Typical order",
  "Gift order",
  "Large mixed order",
  "Over $200",
  "Single item",
  "International order",
];

const shopById = (id: string) => shops.find((s) => s.id === id)!;
const templateById = (id: string) => builtInTemplates.find((t) => t.id === id)!;

describe("demo shops", () => {
  it("are Kiln & Co., Second Stitch and Sticker Barn", () => {
    expect(shops.map((s) => s.name)).toEqual(["Kiln & Co.", "Second Stitch", "Sticker Barn"]);
  });

  describe.each(shops.map((s) => [s.name, s] as const))("%s", (_name, shop) => {
    it("ships the spec's six example orders, a default order and a logo", () => {
      expect(shop.orders.map((o) => o.label)).toEqual(SPEC_ORDER_LABELS);
      expect(new Set(shop.orders.map((o) => o.id)).size).toBe(shop.orders.length);
      expect(shop.orders.map((o) => o.id)).toContain(shop.defaultOrderId);
      expect(Object.keys(shop.assets)).toContain("logo");
      for (const url of Object.values(shop.assets)) expect(url).toMatch(/^data:/);
    });

    it("gives every item the same option keys", () => {
      const keySets = shop.orders.flatMap((o) => o.lineItems.map((li) => Object.keys(li.options).join("|")));
      expect(new Set(keySets).size).toBe(1);
    });

    it("has the cases its orders are labelled with", () => {
      const byLabel = (label: string) => shop.orders.find((o) => o.label === label)!;
      const gift = byLabel("Gift order");
      expect(gift.isGift).toBe(true);
      expect(gift.giftMessage).not.toBe("");
      expect(byLabel("Over $200").total).toBeGreaterThan(200);
      expect(byLabel("Single item").lineItems).toHaveLength(1);
      expect(byLabel("International order").shippingAddress.country).not.toBe("United States");

      const large = byLabel("Large mixed order");
      const keys = Object.keys(large.lineItems[0]!.options);
      const mostValues = Math.max(...keys.map((k) => new Set(large.lineItems.map((li) => li.options[k])).size));
      expect(mostValues).toBeGreaterThanOrEqual(3);
      // Quantity ties, for multi-key sorting.
      const quantities = large.lineItems.map((li) => li.quantity);
      expect(new Set(quantities).size).toBeLessThan(quantities.length);
    });

    it("keeps each order's money consistent", () => {
      for (const o of shop.orders) {
        expect(o.subtotal).toBe(o.lineItems.reduce((sum, li) => sum + li.unitPrice * li.quantity, 0));
        expect(o.total).toBe(o.subtotal + o.shipping);
      }
    });
  });
});

describe("built-in templates", () => {
  it("are Classic, Compact and Boutique with their paper sizes", () => {
    expect(builtInTemplates.map((t) => [t.name, t.paper, t.builtIn])).toEqual([
      ["Classic", "letter", true],
      ["Compact", "4x6", true],
      ["Boutique", "letter", true],
    ]);
  });

  const cases = builtInTemplates.flatMap((t) =>
    shops.flatMap((s) => s.orders.map((o) => [t.name, s.name, o.label, t, s, o] as const)),
  );
  it.each(cases)("%s renders %s's %s with every line item", async (_t, _s, _o, template, shop, order) => {
    const html = await renderSlip(template.source, shop, order);
    expect(html).toContain(order.number);
    expect(html).toContain(order.shippingAddress.postalCode);
    for (const item of order.lineItems) expect(html).toContain(escapeHtml(item.title));
  });

  it("Compact is black and white with no prices and a big order number", async () => {
    const compact = templateById("compact");
    const shop = shopById("sticker-barn");
    const order = defaultOrder(shop);
    const html = await renderSlip(compact.source, shop, order);

    expect(html).not.toContain("$");
    expect(html).toMatch(/class="order-number"/);
    expect(compact.source).toMatch(/\.order-number\s*\{[^}]*font-size:\s*(2[4-9]|[3-9]\d)pt/);
    // Only black, white and greys: every hex colour has equal channels.
    for (const [hex] of compact.source.matchAll(/#[0-9a-f]{3,6}\b/gi)) {
      const h = hex.length === 4 ? hex.slice(1).replace(/./g, "$&$&") : hex.slice(1);
      expect(h.slice(0, 2), hex).toBe(h.slice(2, 4));
      expect(h.slice(2, 4), hex).toBe(h.slice(4, 6));
    }
  });

  it("Boutique has a script heading, centered layout and a personal-note box", async () => {
    const boutique = templateById("boutique");
    const shop = shopById("second-stitch");
    const gift = shop.orders.find((o) => o.isGift)!;
    const plain = shop.orders.find((o) => !o.isGift)!;

    expect(boutique.source).toMatch(/cursive/);
    expect(boutique.source).toMatch(/text-align:\s*center/);
    const giftHtml = await renderSlip(boutique.source, shop, gift);
    expect(giftHtml).toContain('class="personal-note"');
    expect(giftHtml).toContain(escapeHtml(gift.giftMessage));
    expect(await renderSlip(boutique.source, shop, plain)).toContain('class="personal-note"');
  });
});

describe("grouping by each shop's option key", () => {
  // One items table per value of an option, the way Ember writes it with built-in group_by.
  const grouped = (key: string) => `{% assign groups = order.lineItems | group_by: "options.${key}" %}
{% for group in groups %}<table class="items" data-group="{{ group.name | escape }}">{% for item in group.items %}<tr><td>{{ item.title | escape }}</td></tr>{% endfor %}</table>{% endfor %}`;

  it.each([
    ["kiln-and-co", "Glaze", ["Tenmoku", "Celadon", "Speckled", "Shino"]],
    ["second-stitch", "Size", ["M", "S", "L"]],
    ["sticker-barn", "Finish", ["Foil", "Matte"]],
  ])("%s groups its large mixed order by %s", async (shopId, key, expected) => {
    const shop = shopById(shopId);
    const order = shop.orders.find((o) => o.label === "Large mixed order")!;
    const html = await renderSlip(grouped(key), shop, order);

    const groups = [...html.matchAll(/data-group="([^"]*)"/g)].map((m) => m[1]);
    expect(groups).toEqual(expected);
    expect((html.match(/<tr>/g) ?? []).length).toBe(order.lineItems.length);
  });
});

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&#34;").replace(/'/g, "&#39;");
}
