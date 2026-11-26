import { editCall, expect, test } from "./support/ember";
import { editor } from "./support/editor";

// The what-changed line and the missing/extra item warnings under the working slip.
const ITEMS_ASSIGN = '{% assign items = order.lineItems | sort: "title" %}';
const itemsEdit = (expression: string) => ({ find: ITEMS_ASSIGN, replace: `{% assign items = ${expression} %}` });

test("an edit that drops an item warns which item went missing from which orders", async ({ page, ember }) => {
  await ember.onRequest(
    "Leave the ramen bowls off the slip [item-changes drop]",
    editCall([itemsEdit(`order.lineItems | where_exp: "item", "item.title != 'Ramen Bowl'"`)], "Ramen bowls are off the slip 🍜"),
  );
  const ed = editor(page);
  await page.goto("/");
  await expect(ed.whatChanged).toHaveCount(0);

  await ed.send("Leave the ramen bowls off the slip [item-changes drop]");

  await expect(ed.flintSays("Ramen bowls are off the slip 🍜")).toBeVisible();
  await expect(ed.whatChanged).toHaveText("#1001: 1 item missing · #1003: 1 item missing");
  await expect(ed.missingItems).toHaveText("⚠️ Missing items: Ramen Bowl on #1001 and #1003");
  await expect(ed.extraItems).toHaveCount(0);
});

test("an edit that duplicates items warns about extra items", async ({ page, ember }) => {
  await ember.onRequest(
    "Print every item twice [item-changes dup]",
    editCall([itemsEdit("order.lineItems | concat: order.lineItems")], "Every item shows twice now 👯"),
  );
  const ed = editor(page);
  await page.goto("/");

  await ed.send("Print every item twice [item-changes dup]");

  await expect(ed.flintSays("Every item shows twice now 👯")).toBeVisible();
  await expect(ed.extraItems).toContainText("⚠️ Extra items: ");
  await expect(ed.extraItems).toContainText("Bud Vase on #1003 and #1005");
  await expect(ed.whatChanged).toContainText("#1003: 7 items repeated");
  await expect(ed.missingItems).toHaveCount(0);
});

test("a promo line is a new line, not an extra item", async ({ page, ember }) => {
  const promo =
    '<tr><td class="col-qty">1</td><td class="col-title">Free Glaze Sample</td><td></td><td>$0.00</td><td>$0.00</td></tr></tbody>';
  await ember.onRequest(
    "Add a free glaze sample line [item-changes promo]",
    editCall([{ find: "</tbody>", replace: promo }], "Added a free glaze sample 🎁"),
  );
  const ed = editor(page);
  await page.goto("/");

  await ed.send("Add a free glaze sample line [item-changes promo]");

  await expect(ed.flintSays("Added a free glaze sample 🎁")).toBeVisible();
  await expect(ed.working.getByText("Free Glaze Sample")).toBeVisible();
  await expect(ed.whatChanged).toHaveText("No change to items or prices");
  await expect(ed.extraItems).toHaveCount(0);
  await expect(ed.missingItems).toHaveCount(0);
});

test("the seller can keep an edit that has warnings and carry on editing", async ({ page, ember }) => {
  await ember.onRequest(
    "Hide the mini planter [item-changes keep]",
    editCall([itemsEdit(`order.lineItems | where_exp: "item", "item.title != 'Mini Planter'"`)], "Mini planter hidden 🪴"),
  );
  await ember.onRequest(
    "Say cheers in the footer [item-changes keep]",
    editCall([{ find: "Thank you for supporting", replace: "Cheers for supporting" }], "Cheers added 🥂"),
  );
  const ed = editor(page);
  await page.goto("/");

  await ed.send("Hide the mini planter [item-changes keep]");
  await expect(ed.missingItems).toHaveText("⚠️ Missing items: Mini Planter on #1003");
  // The warning informs; the edit is in place and the next request builds on it.
  await expect(ed.working.getByText("Mini Planter")).toHaveCount(0);
  await expect(ed.flintSays("Mini planter hidden 🪴")).toBeVisible();

  await ed.send("Say cheers in the footer [item-changes keep]");
  await expect(ed.flintSays("Cheers added 🥂")).toBeVisible();
  await expect(ed.working.getByText("Cheers for supporting")).toBeVisible();
  await expect(ed.working.getByText("Mini Planter")).toHaveCount(0);
  await expect(ed.missingItems).toHaveText("⚠️ Missing items: Mini Planter on #1003");
});
