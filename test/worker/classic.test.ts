import { describe, expect, it } from "vitest";
import { renderSlip } from "../../src/core";
import { builtInTemplates, shops } from "../../src/data";

// Runs inside the Workers runtime: the Worker validates edits with this same Core environment.
const kiln = shops.find((s) => s.id === "kiln-and-co")!;
const classic = builtInTemplates.find((t) => t.id === "classic")!;

describe("Classic template for Kiln & Co.", () => {
  it("ships about six example orders covering the spec's cases", () => {
    expect(kiln.orders.map((o) => o.label)).toEqual([
      "Typical order",
      "Gift order",
      "Large mixed order",
      "Over $200",
      "Single item",
      "International order",
    ]);
    expect(kiln.orders.map((o) => o.id)).toContain(kiln.defaultOrderId);
    expect(Object.keys(kiln.assets)).toContain("logo");
  });

  it.each(kiln.orders.map((o) => [o.label, o] as const))("renders %s with every line item", async (_label, order) => {
    const html = await renderSlip(classic.source, kiln, order);

    expect(html).toContain(order.number);
    expect(html).toContain(order.totalFormatted);
    for (const item of order.lineItems) {
      expect(html).toContain(item.title);
    }
  });

  it("renders the default order's details, ship-to, item options and totals", async () => {
    const html = await renderSlip(classic.source, kiln, kiln.orders.find((o) => o.id === kiln.defaultOrderId)!);

    expect(html).toContain("Order #1003");
    expect(html).toContain("November 8, 2026");
    expect(html).toContain("San Francisco, CA 94103");
    expect(html).toContain("Glaze: Tenmoku · Size: 12 oz");
    expect(html).toContain("$474.00");
    expect(html).toContain("$492.00");
    // Sorted by name: Bud Vase comes before Serving Bowl.
    expect(html.indexOf("Bud Vase")).toBeLessThan(html.indexOf("Serving Bowl"));
  });

  it("prints the gift message only on gift orders that have one", async () => {
    const gift = kiln.orders.find((o) => o.label === "Gift order")!;
    const typical = kiln.orders.find((o) => o.label === "Typical order")!;

    expect(await renderSlip(classic.source, kiln, gift)).toContain("Happy birthday, Mira!");
    expect(await renderSlip(classic.source, kiln, typical)).not.toContain('class="gift-message"');
  });

  it("refuses a template that references an asset the shop doesn't have", async () => {
    const order = kiln.orders[0]!;
    await expect(renderSlip('<img src="{{ assets.eco_badge }}">', kiln, order)).rejects.toThrow(/eco_badge/);
  });
});
