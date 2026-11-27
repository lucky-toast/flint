import { readFileSync } from "node:fs";
import type { FrameLocator, Locator } from "@playwright/test";
import { askCall, editCall, expect, replyCall, test } from "./support/ember";
import { editor } from "./support/editor";

// Pointing at part of the working slip (issue #20): hover boxes, drill-in clicks, the chip, and the
// selection travelling with the message to Flint.

const outline = (part: Locator) => part.evaluate((el) => getComputedStyle(el).outlineStyle);

/** The user message the fake Ember got for a script's first call. */
async function userMessage(script: { calls(): Promise<any[]> }): Promise<string> {
  const [call] = await script.calls();
  return call.input[0].content;
}

/** The selection note in a user message: the paragraph right after the request. */
function selectionNoteOf(message: string): string {
  const match = /\nRequest: [^\n]*\n\n(Selected [^\n]*)/.exec(message);
  if (!match) throw new Error(`no selection note in:\n${message.slice(-600)}`);
  return match[1]!;
}

const items = (slip: FrameLocator) => slip.locator("table.items");
const skuCell = (slip: FrameLocator) => slip.locator("td.col-sku").first();

test("hovering shows boxes and a name tag; clicks drill in, and clearing works", async ({ page }) => {
  const ed = editor(page);
  await page.goto("/");
  await expect(ed.selectionTip).toBeVisible();

  await skuCell(ed.working).hover();
  // A strong box and a name tag on the section under the cursor, faint boxes on the others.
  await expect(ed.nameTag).toHaveText("Items");
  await expect.poll(() => outline(items(ed.working))).toBe("dashed");
  await expect.poll(() => outline(ed.working.locator("table.totals"))).toBe("dashed");

  // The first click selects the whole section.
  await skuCell(ed.working).click();
  await expect(ed.selectionChip).toHaveText(/Selected: Items/);
  await expect(ed.selectionTip).toHaveCount(0);
  await expect.poll(() => outline(items(ed.working))).toBe("solid");
  // In the app's --selection colour, which the slip's own document doesn't have.
  await expect.poll(() => items(ed.working).evaluate((el) => getComputedStyle(el).outlineColor)).toBe("rgb(232, 89, 12)");
  // Inside the selection, the boxes go one part finer.
  await skuCell(ed.working).hover();
  await expect(ed.nameTag).toHaveText("SKU column");

  await skuCell(ed.working).click();
  await expect(ed.selectionChip).toHaveText(/Selected: SKU column/);
  // A part repeated on every row has its other copies boxed too: an edit reaches them all.
  const skuCells = await ed.working.locator("td.col-sku").count();
  await expect(ed.working.locator("td.col-sku[data-flint-echo]")).toHaveCount(skuCells - 1);
  // The chip names the part and offers only the ×.
  await expect(ed.selectionChip.getByRole("button")).toHaveCount(1);

  await ed.clearSelectionButton.click();
  await expect(ed.selectionChip).toHaveCount(0);
  await expect(ed.selectionTip).toBeVisible();

  // Clicking the selected part again deselects it; clicking outside every part clears.
  await ed.working.locator(".thank-you").click();
  await expect(ed.selectionChip).toHaveText(/Selected: Thank you/);
  // With nothing finer inside it, the name tag says another click clears it.
  await ed.working.locator(".thank-you").hover();
  await expect(ed.nameTag).toHaveText("Thank you · click to clear");
  await ed.working.locator(".thank-you").click();
  await expect(ed.selectionChip).toHaveCount(0);
  await ed.working.locator(".order-details").click();
  await expect(ed.selectionChip).toHaveText(/Selected: Header/);
  await ed.working.locator("body").click({ position: { x: 5, y: 5 } });
  await expect(ed.selectionChip).toHaveCount(0);

  // The original slip has no hover or selection.
  await ed.original.locator("td.col-sku").first().click();
  await expect(ed.selectionChip).toHaveCount(0);
});

test("printing and downloading are unaffected by a selection", async ({ page }) => {
  const ed = editor(page);
  await page.goto("/");
  const thankYou = ed.working.locator(".thank-you");
  await thankYou.click();
  await thankYou.hover();
  await expect(ed.selectionChip).toHaveText(/Thank you/);
  await expect(ed.nameTag).toBeVisible();

  // No box or name tag on paper.
  await page.emulateMedia({ media: "print" });
  await expect.poll(() => outline(thankYou)).toBe("none");
  await expect(ed.nameTag).toBeHidden();
  await page.emulateMedia({ media: "screen" });

  // The saved template is the template, without the preview's source lines.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download" }).click()]);
  const source = readFileSync((await download.path())!, "utf8");
  expect(source).toContain('<p class="thank-you">');
  expect(source).not.toContain("data-flint");
});

test("a message sent with a selection carries its opening tag, and the bubble shows only a tag", async ({ page, ember }) => {
  const script = await ember.onRequest(
    "Make this bold (select)",
    editCall([{ find: ".col-sku { width: 20%;", replace: ".col-sku { font-weight: bold; width: 20%;" }], "Bold SKUs 💪"),
  );
  const ed = editor(page);
  await page.goto("/");

  await skuCell(ed.working).click();
  await skuCell(ed.working).click();
  await expect(ed.selectionChip).toHaveText(/SKU column/);
  await ed.send("Make this bold (select)");
  await expect(ed.flintSays("Bold SKUs 💪")).toBeVisible();

  const message = await userMessage(script);
  // The tag occurs once in the template, so no occurrence is given, and nothing comes from the rendered slip.
  expect(selectionNoteOf(message)).toBe('Selected "SKU column", the element opening with `<td class="col-sku">` in the template.');
  // The preview's instrumentation never reaches Flint.
  expect(message).not.toContain("data-flint");

  const bubble = ed.turn("Make this bold (select)").locator('[data-author="seller"]');
  await expect(bubble).toContainText("📍 SKU column");
  await expect(bubble).not.toContainText("<td");
  await expect(bubble).not.toContainText("item.sku");
});

test("of two look-alike sections, clicking the second sends its tag as occurrence 2 of 2", async ({ page, ember }) => {
  const returnTo = `  <section class="addresses">
    <div class="ship-to">
      <h2>Return to</h2>
      <p>12 Clay Lane</p>
    </div>
  </section>

  {% assign items`;
  await ember.onRequest(
    "Add a return address (look-alike)",
    editCall([{ find: "  {% assign items", replace: returnTo }], "Added a return address 📮"),
  );
  const second = await ember.onRequest("Make this smaller (look-alike)", replyCall("Smaller now"));
  const ed = editor(page);
  await page.goto("/");
  await ed.send("Add a return address (look-alike)");
  await expect(ed.working.getByText("Return to")).toBeVisible();

  await ed.working.getByText("Return to").click();
  await expect(ed.selectionChip).toHaveText(/Selected: Addresses/);
  await ed.send("Make this smaller (look-alike)");
  await expect(ed.flintSays("Smaller now")).toBeVisible();

  expect(selectionNoteOf(await userMessage(second))).toBe(
    'Selected "Addresses", the element opening with `<section class="addresses">` (occurrence 2 of 2 in the template).',
  );
});

test("of two parts on one template line, the clicked one's tag is sent", async ({ page, ember }) => {
  const badges = `  <p class="badges"><span class="badge-eco">Eco</span><span class="badge-local">Local</span></p>

  {% assign items`;
  await ember.onRequest("Add badges (siblings)", editCall([{ find: "  {% assign items", replace: badges }], "Added badges 🏷️"));
  const second = await ember.onRequest("Make this green (siblings)", replyCall("Green it is"));
  const ed = editor(page);
  await page.goto("/");
  await ed.send("Add badges (siblings)");
  await expect(ed.working.getByText("Eco")).toBeVisible();

  await ed.working.locator(".badge-eco").click();
  await ed.working.locator(".badge-eco").click();
  await expect(ed.selectionChip).toHaveText(/Selected: Badge eco/);
  await ed.send("Make this green (siblings)");
  await expect(ed.flintSays("Green it is")).toBeVisible();

  expect(selectionNoteOf(await userMessage(second))).toBe(
    'Selected "Badge eco", the element opening with `<span class="badge-eco">` in the template.',
  );
});

test("the selection survives a clarification, clears after an edit and on an order switch, and Undo and Redo clear it", async ({ page, ember }) => {
  await ember.onRequest("Change this (lifetime)", askCall("Bigger or bolder?", ["Bigger (lifetime)", "Bolder (lifetime)"]));
  const answer = await ember.onRequest(
    "Bolder (lifetime)",
    editCall([{ find: ".thank-you { margin-top: 32px;", replace: ".thank-you { font-weight: bold; margin-top: 32px;" }], "Bolder thanks 💪"),
  );
  const followUp = await ember.onRequest(
    "Now make it red (lifetime)",
    editCall([{ find: ".thank-you { font-weight: bold;", replace: ".thank-you { color: red; font-weight: bold;" }], "Red now ❤️"),
  );
  const ed = editor(page);
  await page.goto("/");

  await ed.working.locator(".thank-you").click();
  await ed.send("Change this (lifetime)");
  await expect(ed.flintSays("Bigger or bolder?")).toBeVisible();
  // A question back doesn't re-render the slip, so the selection stays for the answer.
  await expect(ed.selectionChip).toHaveText(/Thank you/);
  await ed.flintSays("Bigger or bolder?").getByRole("button", { name: "Bolder (lifetime)" }).click();
  await expect(ed.flintSays("Bolder thanks 💪")).toBeVisible();
  expect(await userMessage(answer)).toContain('Request: Bolder (lifetime)\n\nSelected "Thank you"');

  // An accepted edit clears it; the follow-up still knows what "it" was from the history.
  await expect(ed.selectionChip).toHaveCount(0);
  await ed.send("Now make it red (lifetime)");
  await expect(ed.flintSays("Red now ❤️")).toBeVisible();
  const history = await userMessage(followUp);
  expect(history).toContain('Seller: Bolder (lifetime)\nSelected "Thank you"');
  expect(history).not.toContain("Request: Now make it red (lifetime)\n\nSelected");

  // Undo and Redo re-render the slip, so each clears the selection.
  await ed.working.locator(".thank-you").click();
  await expect(ed.selectionChip).toHaveText(/Thank you/);
  await ed.undoButton.click();
  await expect(ed.selectionChip).toHaveCount(0);
  await ed.working.locator(".thank-you").click();
  await expect(ed.selectionChip).toHaveText(/Thank you/);
  await ed.redoButton.click();
  await expect(ed.selectionChip).toHaveCount(0);

  // Switching the example order clears it.
  await ed.working.locator(".thank-you").click();
  await expect(ed.selectionChip).toHaveText(/Thank you/);
  await ed.orderPicker.selectOption({ label: "#1002 · Gift order" });
  await expect(ed.selectionChip).toHaveCount(0);
});

test("Try again resends the selection the message was sent with", async ({ page, ember }) => {
  const first = await ember.onRequest(
    "Shrink this (retry)",
    editCall([{ find: ".totals { margin: 16px 0 0 auto; width: 40%;", replace: ".totals { margin: 16px 0 0 auto; width: 30%;" }], "Narrower totals"),
  );
  const retry = await ember.script(
    { match: "wants a different approach. Last time: Narrower totals" },
    "Shrink this (retry)",
    editCall([{ find: ".totals td { padding: 4px 6px;", replace: ".totals td { padding: 2px 4px;" }], "Tighter totals"),
  );
  const ed = editor(page);
  await page.goto("/");

  await ed.working.locator("table.totals").click();
  await ed.send("Shrink this (retry)");
  await expect(ed.flintSays("Narrower totals")).toBeVisible();
  await expect(ed.selectionChip).toHaveCount(0);

  await ed.tryAgainButton.click();
  await expect(ed.flintSays("Tighter totals")).toBeVisible();

  const note = 'Request: Shrink this (retry)\n\nSelected "Totals"';
  expect(await userMessage(first)).toContain(note);
  expect(await userMessage(retry)).toContain(note);
  await expect(ed.turn("Shrink this (retry)").locator('[data-author="seller"]')).toContainText("📍 Totals");
});
