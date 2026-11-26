import { expect, test, type Page } from "@playwright/test";
import { editor } from "./support/editor";

function picker(page: Page) {
  return {
    shop: page.getByLabel("Shop"),
    templatesButton: page.getByRole("button", { name: "Templates" }),
    card: (name: string) => page.getByRole("article", { name }),
    preview: (name: string) => page.frameLocator(`iframe[title="${name} preview"]`),
    previewFrame: (name: string) => page.locator(`iframe[title="${name} preview"]`),
  };
}

test("switch shop, pick a template and customize it with Flint", async ({ page }) => {
  const p = picker(page);
  const ed = editor(page);
  await page.goto("/");

  await p.shop.selectOption({ label: "Second Stitch" });

  // Every built-in template is previewed with Second Stitch's default order (#2003).
  for (const name of ["Classic", "Compact", "Boutique"]) {
    await expect(p.preview(name).getByText(/#2003/)).toBeVisible();
  }
  await expect(p.preview("Boutique").locator("img.logo")).toHaveAttribute("alt", "Second Stitch");
  await expect(page.getByText("Templates you save for Second Stitch show up here.")).toBeVisible();

  await p.card("Boutique").getByRole("button", { name: "Customize with Flint" }).click();

  await expect(page.getByText("Second Stitch · Boutique")).toBeVisible();
  await expect(ed.working.getByRole("heading", { name: "Thank you, Renee Castillo" })).toBeVisible();
  await expect(ed.original.getByText("Order #2003")).toBeVisible();
  await expect(ed.orderPicker.locator("option")).toHaveText([
    "#2001 · Typical order",
    "#2002 · Gift order",
    "#2003 · Large mixed order",
    "#2004 · Over $200",
    "#2005 · Single item",
    "#2006 · International order",
  ]);
});

test("the Templates button reopens the picker for the current shop", async ({ page }) => {
  const p = picker(page);
  await page.goto("/");
  await expect(editor(page).working.getByText("Order #1003")).toBeVisible();

  await p.templatesButton.click();

  await expect(p.preview("Compact").getByText("#1003")).toBeVisible();
  await p.card("Compact").getByRole("button", { name: "Customize with Flint" }).click();
  await expect(page.getByText("Kiln & Co. · Compact")).toBeVisible();
});

test("Compact previews and edits at 4×6", async ({ page }) => {
  const p = picker(page);
  const ed = editor(page);
  await page.goto("/");
  await p.shop.selectOption({ label: "Sticker Barn" });

  // Laid out at 4in × 6in (96 CSS px per inch), then scaled to fit its card.
  const thumb = p.previewFrame("Compact");
  await expect(p.preview("Compact").getByText("#3003")).toBeVisible();
  await expect(thumb).toHaveAttribute("data-paper", "4x6");
  expect(await thumb.evaluate((el: HTMLElement) => [el.offsetWidth, el.offsetHeight])).toEqual([384, 576]);
  // Each preview keeps its own paper's shape: Classic is Letter.
  await expect(p.previewFrame("Classic")).toHaveAttribute("data-paper", "letter");

  await p.card("Compact").getByRole("button", { name: "Customize with Flint" }).click();

  for (const frame of [ed.originalFrame, ed.workingFrame]) {
    await expect(frame).toHaveAttribute("data-paper", "4x6");
    expect(await frame.evaluate((el: HTMLElement) => [el.offsetWidth, el.offsetHeight])).toEqual([384, 576]);
    const box = (await frame.boundingBox())!;
    expect(box.width / box.height).toBeCloseTo(4 / 6, 2);
  }
  // The print page size follows the paper too.
  expect(await ed.working.locator("head style").evaluate((el) => el.textContent)).toContain("@page { size: 4in 6in;");
});
