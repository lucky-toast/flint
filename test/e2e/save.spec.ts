import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { editCall, expect, test } from "./support/ember";
import { editor } from "./support/editor";

function saving(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Save template" });
  return {
    saveButton: page.getByRole("button", { name: "Save…" }),
    dialog,
    asNew: dialog.getByRole("radio", { name: "Save as new" }),
    overwrite: dialog.getByRole("radio", { name: "Overwrite" }),
    name: dialog.getByRole("textbox", { name: "Name" }),
    target: dialog.getByLabel("Template to overwrite"),
    confirm: dialog.getByRole("button", { name: "Save", exact: true }),
    templatesButton: page.getByRole("button", { name: "Templates" }),
    shop: page.getByLabel("Shop"),
    card: (name: string) => page.getByRole("article", { name }),
    preview: (name: string) => page.frameLocator(`iframe[title="${name} preview"]`),
    discard: page.getByRole("dialog", { name: "Unsaved changes" }),
  };
}

test("Save as new adds the template to the picker and resets the original pane", async ({ page, ember }) => {
  await ember.onRequest(
    "Say howdy in the footer (save as new)",
    editCall([{ find: "Thank you for supporting", replace: "Howdy and thanks for supporting" }], "Howdy added 🤠"),
  );
  const ed = editor(page);
  const s = saving(page);
  await page.goto("/");

  await ed.send("Say howdy in the footer (save as new)");
  await expect(ed.working.getByText("Howdy and thanks for supporting")).toBeVisible();
  await expect(ed.original.getByText("Howdy and thanks for supporting")).toHaveCount(0);

  await s.saveButton.click();
  await expect(s.asNew).toBeChecked();
  // A suggested name, so the original stays untouched.
  await expect(s.name).toHaveValue("Classic copy");
  // Nothing of the seller's own to overwrite yet, and built-ins are never offered.
  await expect(s.overwrite).toHaveCount(0);
  await s.name.fill("Howdy slip");
  await s.confirm.click();

  await expect(s.dialog).toBeHidden();
  await expect(ed.original.getByText("Howdy and thanks for supporting")).toBeVisible();
  await expect(page.getByText("Kiln & Co. · Howdy slip")).toBeVisible();
  // The working slip now matches the original, so nothing is unsaved: the picker opens without asking.
  await s.templatesButton.click();
  await expect(s.discard).toHaveCount(0);
  const card = page.getByRole("region", { name: "Your templates" }).getByRole("article", { name: "Howdy slip" });
  await expect(card).toBeVisible();
  await expect(s.preview("Howdy slip").getByText("Howdy and thanks for supporting")).toBeVisible();
  // Saved per shop: another shop doesn't have it.
  await s.shop.selectOption({ label: "Second Stitch" });
  await expect(page.getByText("Templates you save for Second Stitch show up here.")).toBeVisible();
  // And it's still there after a reload.
  await page.reload();
  await s.templatesButton.click();
  await expect(s.card("Howdy slip")).toBeVisible();
});

test("overwrite replaces one of the seller's own templates; built-ins are never offered", async ({ page, ember }) => {
  await ember.onRequest(
    "Say g'day in the footer (overwrite)",
    editCall([{ find: "Thank you for supporting", replace: "G'day and thanks for supporting" }], "G'day added 🦘"),
  );
  await ember.onRequest(
    "Say hiya in the footer (overwrite)",
    editCall([{ find: "G'day and thanks for supporting", replace: "Hiya and thanks for supporting" }], "Hiya added 👋"),
  );
  const ed = editor(page);
  const s = saving(page);
  await page.goto("/");

  await ed.send("Say g'day in the footer (overwrite)");
  await expect(ed.working.getByText("G'day and thanks for supporting")).toBeVisible();
  await s.saveButton.click();
  await s.name.fill("Aussie slip");
  await s.confirm.click();
  await expect(page.getByText("Kiln & Co. · Aussie slip")).toBeVisible();

  await ed.send("Say hiya in the footer (overwrite)");
  await expect(ed.working.getByText("Hiya and thanks for supporting")).toBeVisible();
  await s.saveButton.click();
  await s.overwrite.check();
  await expect(s.target.locator("option")).toHaveText(["Aussie slip"]);
  await s.confirm.click();
  await expect(s.dialog).toBeHidden();
  await expect(ed.original.getByText("Hiya and thanks for supporting")).toBeVisible();

  await s.templatesButton.click();
  const own = page.getByRole("region", { name: "Your templates" }).getByRole("article");
  await expect(own).toHaveCount(1);
  await expect(s.preview("Aussie slip").getByText("Hiya and thanks for supporting")).toBeVisible();
  // The built-in it started from is unchanged.
  await expect(s.preview("Classic").getByText("Thank you for supporting")).toBeVisible();
});

test("leaving with unsaved changes asks first; keep editing stays, discarding leaves", async ({ page, ember }) => {
  await ember.onRequest(
    "Say ahoy in the footer (unsaved)",
    editCall([{ find: "Thank you for supporting", replace: "Ahoy and thanks for supporting" }], "Ahoy added ⚓"),
  );
  const ed = editor(page);
  const s = saving(page);
  await page.goto("/");
  await ed.send("Say ahoy in the footer (unsaved)");
  await expect(ed.working.getByText("Ahoy and thanks for supporting")).toBeVisible();

  // The Templates button asks; Keep editing stays put.
  await s.templatesButton.click();
  await expect(s.discard).toBeVisible();
  await s.discard.getByRole("button", { name: "Keep editing" }).click();
  await expect(s.discard).toBeHidden();
  await expect(ed.working.getByText("Ahoy and thanks for supporting")).toBeVisible();

  // Switching shop asks too, and the switcher stays on the current shop until the seller decides.
  await s.shop.selectOption({ label: "Sticker Barn" });
  await expect(s.discard).toBeVisible();
  await expect(s.shop).toHaveValue("kiln-and-co");
  await s.discard.getByRole("button", { name: "Keep editing" }).click();
  await expect(ed.working.getByText("Ahoy and thanks for supporting")).toBeVisible();

  // Closing the tab asks the browser to confirm.
  const dialogs: string[] = [];
  page.on("dialog", (d) => {
    dialogs.push(d.type());
    void d.dismiss();
  });
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => dialogs).toEqual(["beforeunload"]);
});

test("discarding unsaved changes switches shop", async ({ page, ember }) => {
  await ember.onRequest(
    "Say aloha in the footer (discard)",
    editCall([{ find: "Thank you for supporting", replace: "Aloha and thanks for supporting" }], "Aloha added 🌺"),
  );
  const ed = editor(page);
  const s = saving(page);
  await page.goto("/");
  await ed.send("Say aloha in the footer (discard)");
  await expect(ed.working.getByText("Aloha and thanks for supporting")).toBeVisible();

  await s.shop.selectOption({ label: "Sticker Barn" });
  await s.discard.getByRole("button", { name: "Discard changes" }).click();

  await expect(s.shop).toHaveValue("sticker-barn");
  await expect(s.preview("Classic").getByText("#3003")).toBeVisible();
  // Once discarded, nothing is pending, so closing the tab wouldn't ask.
  await s.card("Classic").getByRole("button", { name: "Customize with Flint" }).click();
  await expect(page.getByText("Sticker Barn · Classic")).toBeVisible();
  const asksToStay = await page.evaluate(() => {
    const e = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(asksToStay).toBe(false);
});

test("Download gives the working source as a .liquid file", async ({ page, ember }) => {
  await ember.onRequest(
    "Say bonjour in the footer (download)",
    editCall([{ find: "Thank you for supporting", replace: "Bonjour and thanks for supporting" }], "Bonjour added 🥐"),
  );
  const ed = editor(page);
  await page.goto("/");
  await ed.send("Say bonjour in the footer (download)");
  await expect(ed.working.getByText("Bonjour and thanks for supporting")).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download" }).click(),
  ]);

  expect(download.suggestedFilename()).toBe("classic.liquid");
  const source = readFileSync((await download.path())!, "utf8");
  expect(source).toContain("Bonjour and thanks for supporting");
  expect(source).toContain("{% for item in");
});

test("Print prints the working slip's frame at the template's paper size", async ({ page }) => {
  const ed = editor(page);
  const s = saving(page);
  await page.goto("/");
  await s.templatesButton.click();
  await s.card("Compact").getByRole("button", { name: "Customize with Flint" }).click();
  await expect(ed.working.getByText("#1003")).toBeVisible();

  // Record the print call instead of opening the system dialog.
  await ed.workingFrame.evaluate((el: HTMLIFrameElement) => {
    const win = el.contentWindow as Window & { printed?: number };
    win.printed = 0;
    win.print = () => void (win.printed! += 1);
  });
  await page.getByRole("button", { name: "Print" }).click();

  expect(
    await ed.workingFrame.evaluate((el: HTMLIFrameElement) => (el.contentWindow as Window & { printed?: number }).printed),
  ).toBe(1);
  expect(await ed.working.locator("head style").evaluate((el) => el.textContent)).toContain("@page { size: 4in 6in;");
});
