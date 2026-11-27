import { editCall, expect, test } from "./support/ember";
import { editor } from "./support/editor";

test("the code is hidden until the seller switches the working pane to Code", async ({ page }) => {
  await page.goto("/");
  const switcher = page.getByRole("group", { name: "Show the working slip or its code" });
  const code = switcher.getByRole("button", { name: "Code", exact: true });
  const slip = switcher.getByRole("button", { name: "Slip", exact: true });
  await expect(slip).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Template code" })).toHaveCount(0);

  await code.click();

  const view = page.getByRole("region", { name: "Template code" });
  await expect(view.getByText("Order #{{ order.number | escape }}").first()).toBeVisible();
  await expect(view.getByText("No changes yet")).toBeVisible();

  await slip.click();
  await expect(page.getByRole("region", { name: "Template code" })).toHaveCount(0);
});

test("after an edit, the diff shows the changed lines against the original", async ({ page, ember }) => {
  await ember.onRequest(
    "Say cheers instead of thank you (show-code diff)",
    editCall([{ find: "Thank you for supporting", replace: "Cheers for supporting" }], "Cheers it is 🍻"),
  );
  const ed = editor(page);
  await page.goto("/");
  await ed.send("Say cheers instead of thank you (show-code diff)");
  await expect(ed.flintSays("Cheers it is 🍻")).toBeVisible();
  // The chat never shows code.
  await expect(ed.chat.getByText("{{")).toHaveCount(0);

  await page.getByRole("button", { name: "Code", exact: true }).click();

  const diff = page.getByRole("region", { name: "Changes from the original" });
  await expect(diff.locator('[data-change="removed"]', { hasText: "Thank you for supporting" })).toHaveCount(1);
  await expect(diff.locator('[data-change="added"]', { hasText: "Cheers for supporting" })).toHaveCount(1);
  // Unchanged lines far from the edit are not listed as changes.
  await expect(diff.locator("[data-change]", { hasText: "Order #{{ order.number | escape }}" })).toHaveCount(0);
  const source = page.getByRole("region", { name: "Working template" });
  await expect(source).toContainText("Cheers for supporting");
});
