import { expect, test, type Page } from "@playwright/test";
import { E2E_ACCESS_CODE, withoutAccessCode } from "./support/access";
import { pausedAppURL } from "./support/ports";

// A valid access code while live mode is unavailable: the header says the code worked and why turns
// are still replayed, instead of looking as if the code were refused (#22). The paused cases run
// against a second Worker with the kill switch off (playwright.config.ts).

test.use({ storageState: withoutAccessCode });

function header(page: Page) {
  return {
    badge: page.locator(".mode-badge"),
    enterCode: page.getByRole("button", { name: "Have an access code?" }),
    forget: page.getByRole("button", { name: "Forget code" }),
    code: page.getByLabel("Access code", { exact: true }),
    unlock: page.getByRole("button", { name: "Unlock" }),
  };
}

test("a valid code with live mode paused says so and offers to forget the code", async ({ page }) => {
  const h = header(page);
  await page.goto(pausedAppURL);
  await h.enterCode.click();

  await h.code.fill("not-the-code");
  await h.unlock.click();
  await expect(page.getByRole("alert")).toHaveText("That code didn't work");

  await h.code.fill(E2E_ACCESS_CODE);
  await h.unlock.click();
  await expect(h.badge).toHaveText("Replay");
  await expect(page.getByText("Live mode is paused")).toBeVisible();
  await expect(h.forget).toBeVisible();
  await expect(h.enterCode).toHaveCount(0);

  // The code is remembered, and the header says the same after a reload.
  await page.reload();
  await expect(page.getByText("Live mode is paused")).toBeVisible();

  await h.forget.click();
  await expect(h.enterCode).toBeVisible();
  await expect(page.getByText("Live mode is paused")).toHaveCount(0);
});

test("a valid code with the budget used up says the budget is used up", async ({ page }) => {
  const h = header(page);
  // The e2e Worker's budget is shared by every test, so the used-up status is stubbed here.
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { live: true, access: true, budgetRemainingPct: 0 } }),
  );
  await page.goto("/");

  await expect(h.badge).toHaveText("Replay");
  await expect(page.getByText("Live budget is used up")).toBeVisible();
  await expect(h.forget).toBeVisible();
  await expect(h.enterCode).toHaveCount(0);
});
