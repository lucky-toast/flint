import { askCall, COMMENTARY, editCall, expect, replyCall, test } from "./support/ember";
import { editor } from "./support/editor";

const THANK_YOU = "Thank you for supporting";

test("a vague request gets chips, and tapping one sends it as the seller's reply", async ({ page, ember }) => {
  await ember.onRequest(
    "Make it look nicer",
    askCall("Happy to! What should I change first? ✨", ["Bigger logo", "Bolder totals", "Softer colors"]),
  );
  const followUp = await ember.onRequest(
    "Bigger logo",
    editCall([{ find: ".logo { height: 56px; }", replace: ".logo { height: 96px; }" }], "Your logo is bigger now 🎉"),
  );
  const ed = editor(page);
  await page.goto("/");
  const logoHeight = () => ed.working.locator("img.logo").evaluate((img: HTMLElement) => img.getBoundingClientRect().height);
  await expect(ed.working.locator("img.logo")).toBeVisible();
  const before = await logoHeight();

  await ed.send("Make it look nicer");

  const question = ed.flintSays("Happy to! What should I change first? ✨");
  await expect(question).toBeVisible();
  const chips = question.getByRole("button");
  await expect(chips).toHaveText(["Bigger logo", "Bolder totals", "Softer colors"]);
  await expect(page.getByText(COMMENTARY)).toHaveCount(0);

  await question.getByRole("button", { name: "Bigger logo" }).click();

  await expect(ed.sellerSaid("Bigger logo")).toBeVisible();
  await expect(ed.flintSays("Your logo is bigger now 🎉")).toBeVisible();
  await expect.poll(logoHeight).toBeGreaterThan(before);
  // The chips are spent once answered.
  await expect(chips).toHaveCount(0);
  // Ember sees the question it asked in the conversation.
  const [call] = await followUp.calls();
  expect(call.input[0].content).toContain("Seller: Make it look nicer\nFlint: Happy to! What should I change first? ✨");
});

test("an out-of-scope message gets a reply bubble and no template change", async ({ page, ember }) => {
  const reply = "I only do packing slips 😊 but I could add a cozy thank-you note instead!";
  await ember.onRequest("What's the weather like in Lisbon today?", replyCall(reply));
  const ed = editor(page);
  await page.goto("/");
  const before = await ed.working.locator("body").innerHTML();

  await ed.send("What's the weather like in Lisbon today?");

  const bubble = ed.flintSays(reply);
  await expect(bubble).toBeVisible();
  await expect(bubble.getByRole("button")).toHaveCount(0);
  await expect(page.getByText(COMMENTARY)).toHaveCount(0);
  await expect(ed.working.getByText(THANK_YOU)).toBeVisible();
  expect(await ed.working.locator("body").innerHTML()).toBe(before);
});
