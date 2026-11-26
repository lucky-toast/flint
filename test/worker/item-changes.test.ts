import { describe, expect, it } from "vitest";
import { compareItems, extraItemsWarning, missingItemsWarning, whatChanged } from "../../src/core";
import { builtInTemplates, shops } from "../../src/data";

// The item-change counter compares the slip before and after an edit across every example order.
// It runs in the browser; here it runs in the Workers runtime, which proves it needs no DOM.
const kiln = shops.find((s) => s.id === "kiln-and-co")!;
const classic = builtInTemplates.find((t) => t.id === "classic")!.source;

const ITEMS_ASSIGN = '{% assign items = order.lineItems | sort: "title" %}';
function withItems(expression: string) {
  const source = classic.replace(ITEMS_ASSIGN, `{% assign items = ${expression} %}`);
  expect(source).not.toBe(classic);
  return source;
}

describe("item-change counter", () => {
  it("reports nothing when every item and price still shows", async () => {
    const changes = await compareItems(classic, classic.replace("Thank you", "Thanks"), kiln);

    expect(changes.orders).toEqual([]);
    expect(whatChanged(changes)).toBe("No change to items or prices");
    expect(missingItemsWarning(changes)).toBeNull();
    expect(extraItemsWarning(changes)).toBeNull();
  });

  it("names a dropped item and every order it went missing from", async () => {
    const after = withItems(`order.lineItems | where_exp: "item", "item.title != 'Ramen Bowl'"`);

    const changes = await compareItems(classic, after, kiln);

    expect(whatChanged(changes)).toBe("#1001: 1 item missing · #1003: 1 item missing");
    expect(missingItemsWarning(changes)).toBe("⚠️ Missing items: Ramen Bowl on #1001 and #1003");
    expect(extraItemsWarning(changes)).toBeNull();
  });

  it("flags items that show more than once", async () => {
    const after = withItems("order.lineItems | concat: order.lineItems");

    const changes = await compareItems(classic, after, kiln);

    expect(whatChanged(changes)).toContain("#1005: 1 item repeated");
    expect(whatChanged(changes)).toContain("#1003: 7 items repeated");
    expect(extraItemsWarning(changes)).toContain("⚠️ Extra items: ");
    expect(extraItemsWarning(changes)).toContain("Bud Vase on #1003 and #1005");
    expect(missingItemsWarning(changes)).toBeNull();
  });

  it("doesn't count a brand-new line, like a promo item, as extra", async () => {
    const promo = '<tr><td class="col-qty">1</td><td class="col-title">Free Glaze Sample</td><td></td><td>$0.00</td><td>$0.00</td></tr>';
    const after = classic.replace("</tbody>", `${promo}</tbody>`);

    const changes = await compareItems(classic, after, kiln);

    expect(changes.orders).toEqual([]);
    expect(extraItemsWarning(changes)).toBeNull();
  });

  it("notices prices hidden from the items", async () => {
    const after = classic
      .replace("<td class=\"col-price\">{{ item.unitPriceFormatted }}</td>", "")
      .replace("<td class=\"col-total\">{{ item.lineTotalFormatted }}</td>", "");

    const changes = await compareItems(classic, after, kiln);

    expect(whatChanged(changes)).toBe("prices hidden on 6 orders");
    expect(missingItemsWarning(changes)).toBeNull();
  });

  it("puts each order's item changes before the price summary", async () => {
    // Drop the cheapest item on #1003 and stop printing per-item prices on #1003 only.
    const after = withItems(`order.lineItems | where_exp: "item", "item.title != 'Mini Planter'"`)
      .replace("{{ item.unitPriceFormatted }}", '{% if order.number != "1003" %}{{ item.unitPriceFormatted }}{% endif %}')
      .replace("{{ item.lineTotalFormatted }}", '{% if order.number != "1003" %}{{ item.lineTotalFormatted }}{% endif %}');

    const changes = await compareItems(classic, after, kiln);

    expect(whatChanged(changes)).toBe("#1003: 1 item missing · prices hidden on 1 order");
  });

  it("finds titles with an apostrophe (Second Stitch's Levi's 501 Jeans), escaped on the slip", async () => {
    const stitch = shops.find((s) => s.id === "second-stitch")!;
    expect(await compareItems(classic, classic.replace("Thank you", "Thanks"), stitch)).toMatchObject({ orders: [] });

    const after = withItems(`order.lineItems | where_exp: "item", "item.sku != 'JNS-501-W32'"`);
    const changes = await compareItems(classic, after, stitch);

    expect(missingItemsWarning(changes)).toBe("⚠️ Missing items: Levi's 501 Jeans on #2001");
  });

  it("reports nothing on an unchanged slip whose order text has an ampersand (Sticker Barn)", async () => {
    const barn = shops.find((s) => s.id === "sticker-barn")!;
    expect(barn.orders.some((o) => o.buyer.includes("&"))).toBe(true);

    const changes = await compareItems(classic, classic.replace("Thank you", "Thanks"), barn);

    expect(changes.orders).toEqual([]);
  });

  it("still counts a title shown in capitals or across escaped characters", async () => {
    const after = classic.replace("{{ item.title | escape }}", "{{ item.title | upcase | escape }}");

    const changes = await compareItems(classic, after, kiln);

    expect(changes.orders).toEqual([]);
  });
});
