import type { Page } from "@playwright/test";
import { REPLAY_CHIPS } from "../../src/data";
import { E2E_ACCESS_CODE, withoutAccessCode } from "./support/access";
import { editor } from "./support/editor";
import { expect, replyCall, test } from "./support/ember";

// Replay mode: a visitor without an access code sees a Replay badge and chips for the scripted demo
// requests, and each chip plays its recorded response through the Worker. No fake Ember script is
// set up, so any Ember call would come back as "Flint is resting" and fail these tests.

test.use({ storageState: withoutAccessCode });

// A 1x1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const ACCESS_CODE_NOTE = "Live mode needs an access code; try one of these 👇";

function replay(page: Page) {
  const group = page.getByRole("group", { name: "Try one of these" });
  return {
    badge: page.locator(".mode-badge"),
    group,
    chips: group.getByRole("button"),
    chip: (text: string) => group.getByRole("button", { name: text, exact: true }),
  };
}

const [SORT, GLAZE, PROMO, GIFT_PRICES, GIFT_MESSAGE, ECO_BADGE, NICER, BIGGER_LOGO] = REPLAY_CHIPS as [
  string, string, string, string, string, string, string, string,
];

test("without an access code, the editor shows a Replay badge and the scripted requests as chips", async ({ page }) => {
  const r = replay(page);
  await page.goto("/");

  await expect(r.badge).toHaveText("Replay");
  await expect(r.chips).toHaveText(REPLAY_CHIPS);
});

test("each replay chip plays its recorded response end to end, in demo order", async ({ page }) => {
  const ed = editor(page);
  const r = replay(page);
  await page.goto("/");
  const logoHeight = () => ed.working.locator("img.logo").evaluate((img: HTMLElement) => img.getBoundingClientRect().height);
  await expect(ed.working.locator("img.logo")).toBeVisible();
  const logoBefore = await logoHeight();

  // 1. Sort: the 4 Tenmoku mugs come first on the large order.
  await r.chip(SORT).click();
  await expect(ed.flintSays("Sorted line items by quantity (highest first), then SKU.")).toBeVisible();
  await expect(ed.working.locator("td.col-sku").first()).toHaveText("MUG-12-TNM");

  // 2. A table per glaze.
  await r.chip(GLAZE).click();
  await expect(ed.flintSays("Split the items into one table per glaze")).toBeVisible();
  await expect(ed.working.locator("h3.glaze-heading")).toHaveText(["Tenmoku", "Celadon", "Speckled", "Shino"]);

  // 3. The promo line, once, on this $492 order.
  await r.chip(PROMO).click();
  await expect(ed.flintSays("Added a free mystery mini planter line for orders over $200 🎁")).toBeVisible();
  await expect(ed.working.getByText("Free mystery mini planter")).toHaveCount(1);

  // 4. No prices on gift orders.
  await r.chip(GIFT_PRICES).click();
  await expect(ed.flintSays("Hid the prices and totals on gift orders 🎁")).toBeVisible();
  await ed.orderPicker.selectOption("kiln-1002");
  await expect(ed.original.locator("table.totals")).toHaveCount(1);
  await expect(ed.working.locator("table.totals")).toHaveCount(0);
  await expect(ed.working.locator("td.col-price")).toHaveCount(0);

  // 5. The gift message stands out.
  await r.chip(GIFT_MESSAGE).click();
  await expect(ed.flintSays("Put the gift message in a highlighted note box on gift orders 🎁")).toBeVisible();
  await expect(ed.working.locator(".gift-message")).toHaveCSS("background-color", "rgb(251, 238, 230)");

  // 6. The eco badge: Flint asks for it, the visitor uploads it, and Flint places it.
  await r.chip(ECO_BADGE).click();
  await expect(ed.flintSays("Your new eco-friendly badge image to place under the shop name")).toBeVisible();
  const upload = page.getByRole("form", { name: "Upload an image" });
  await upload.getByLabel("Image", { exact: true }).setInputFiles({ name: "Eco Badge.png", mimeType: "image/png", buffer: PNG });
  await expect(upload.getByLabel("Image name")).toHaveValue("eco_badge");
  await upload.getByRole("button", { name: "Upload" }).click();
  await expect(ed.flintSays("Added your eco-friendly badge under the shop name 🌱")).toBeVisible();
  await expect(ed.working.locator(".brand img.eco-badge")).toHaveAttribute("src", /^data:image\/png;base64,/);

  // 7. "Make it look nicer" asks, with chips.
  await r.chip(NICER).click();
  const question = ed.flintSays("Happy to! What would you like me to change first? ✨");
  await expect(question.getByRole("button")).toHaveText(["Bigger logo", "Make the gift message stand out"]);

  // 8. Its "Bigger logo" chip.
  await question.getByRole("button", { name: "Bigger logo" }).click();
  await expect(ed.flintSays("Made the logo twice as big (56px → 112px).")).toBeVisible();
  await expect.poll(logoHeight).toBeGreaterThan(logoBefore);

  await expect(page.getByText("Flint is resting")).toHaveCount(0);
});

test("the bigger-logo chip plays on its own too", async ({ page }) => {
  const ed = editor(page);
  await page.goto("/");

  await replay(page).chip(BIGGER_LOGO).click();

  await expect(ed.flintSays("Made the logo twice as big (56px → 112px).")).toBeVisible();
});

test("free text in replay mode gets the access-code note, and the chips stay", async ({ page }) => {
  const ed = editor(page);
  const r = replay(page);
  await page.goto("/");

  await ed.send("Add a QR code to the footer, replay edition");

  await expect(ed.flintSays(ACCESS_CODE_NOTE)).toBeVisible();
  await expect(r.chips).toHaveCount(REPLAY_CHIPS.length);
});

test("a valid access code switches to live mode; a wrong one is refused", async ({ page, ember }) => {
  await ember.onRequest("Say hi after unlocking", replyCall("Hi from live mode 👋"));
  const ed = editor(page);
  const r = replay(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Have an access code?" }).click();
  const code = page.getByLabel("Access code", { exact: true });

  await code.fill("not-the-code");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByRole("alert")).toHaveText("That code didn't work");
  await expect(r.badge).toHaveText("Replay");

  await code.fill(E2E_ACCESS_CODE);
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(r.badge).toHaveText("Live");
  await expect(r.group).toHaveCount(0);

  await ed.send("Say hi after unlocking");
  await expect(ed.flintSays("Hi from live mode 👋")).toBeVisible();

  // The code is remembered in this browser.
  await page.reload();
  await expect(r.badge).toHaveText("Live");
});
