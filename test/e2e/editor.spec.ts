import { COMMENTARY, editCall, expect, test, truncated } from "./support/ember";
import { editor } from "./support/editor";

const THANK_YOU = "Thank you for supporting";

test("an accepted edit updates the working slip, leaves the original alone and gets a cheerful confirmation", async ({
  page,
  ember,
}) => {
  await ember.onRequest(
    "Change the thank-you line to say thanks a bunch",
    editCall([{ find: "Thank you for supporting", replace: "Thanks a bunch for supporting" }], "Your thank-you now says thanks a bunch 🎉"),
  );
  const ed = editor(page);
  await page.goto("/");
  await expect(ed.working.getByText(THANK_YOU)).toBeVisible();

  await ed.send("Change the thank-you line to say thanks a bunch");

  await expect(ed.sellerSaid("Change the thank-you line to say thanks a bunch")).toBeVisible();
  await expect(ed.flintSays("Your thank-you now says thanks a bunch 🎉")).toBeVisible();
  await expect(ed.working.getByText("Thanks a bunch for supporting")).toBeVisible();
  await expect(ed.original.getByText(THANK_YOU)).toBeVisible();
  await expect(ed.original.getByText("Thanks a bunch")).toHaveCount(0);
  // Ember's side commentary is never shown.
  await expect(page.getByText(COMMENTARY)).toHaveCount(0);
});

test("the next request edits the working slip, and Flint sees the conversation so far", async ({ page, ember }) => {
  await ember.onRequest(
    "Call the buyer the customer",
    editCall([{ find: "<div>Buyer:", replace: "<div>Customer:" }], "Buyers are now customers 👍"),
  );
  const second = await ember.onRequest(
    "Make the gift message box green",
    editCall([{ find: "border: 1px dashed #b5532f", replace: "border: 1px dashed #2f7d4a" }], "The gift box is green now 🌿"),
  );
  const ed = editor(page);
  await page.goto("/");

  await ed.send("Call the buyer the customer");
  await expect(ed.flintSays("Buyers are now customers 👍")).toBeVisible();
  await ed.send("Make the gift message box green");
  await expect(ed.flintSays("The gift box is green now 🌿")).toBeVisible();

  await expect(ed.working.getByText("Customer: Hannah Lindqvist")).toBeVisible();
  await expect(ed.original.getByText("Buyer: Hannah Lindqvist")).toBeVisible();
  const [call] = await second.calls();
  const userMessage: string = call.input[0].content;
  expect(userMessage).toContain("<div>Customer:");
  expect(userMessage).toContain("Seller: Call the buyer the customer\nFlint: Buyers are now customers 👍");
});

test("switching the example order re-renders both slips", async ({ page }) => {
  const ed = editor(page);
  await page.goto("/");
  await expect(ed.original.getByText("Order #1003")).toBeVisible();
  await expect(ed.working.getByText("Order #1003")).toBeVisible();

  await ed.orderPicker.selectOption({ label: "#1002 · Gift order" });

  for (const slip of [ed.original, ed.working]) {
    await expect(slip.getByText("Order #1002")).toBeVisible();
    await expect(slip.getByText("Happy birthday, Mira!")).toBeVisible();
    await expect(slip.getByText("Order #1003")).toHaveCount(0);
  }
});

test("Flint is thinking from send until the reply arrives", async ({ page, ember }) => {
  await ember.script(
    { delayMs: 1500 },
    "Put the order number in bold caps",
    editCall([{ find: "Order #{{ order.number | escape }}", replace: "ORDER #{{ order.number | escape }}" }], "Order number shouts now 📣"),
  );
  const ed = editor(page);
  await page.goto("/");
  await expect(ed.thinking).toHaveCount(0);

  await ed.send("Put the order number in bold caps");

  await expect(ed.thinking).toBeVisible();
  await expect(ed.flintSays("Order number shouts now 📣")).toHaveCount(0);
  await expect(ed.sendButton).toBeDisabled();
  await expect(ed.flintSays("Order number shouts now 📣")).toBeVisible();
  await expect(ed.thinking).toHaveCount(0);
});

test("a request too big for one go gets a friendly nudge and leaves the working slip unchanged", async ({ page, ember }) => {
  await ember.onRequest("Redesign the whole slip as a magazine spread", truncated());
  const ed = editor(page);
  await page.goto("/");

  await ed.send("Redesign the whole slip as a magazine spread");

  await expect(ed.flintSays(/smaller steps/)).toBeVisible();
  await expect(ed.working.getByText(THANK_YOU)).toBeVisible();
  await expect(ed.working.getByText("Order #1003")).toBeVisible();
});

test("an edit Flint can't make valid gets a suggestion to reword and leaves the working slip unchanged", async ({
  page,
  ember,
}) => {
  // Every attempt's find text is missing from the template, so all three are rejected.
  const broken = () => editCall([{ find: "<marquee>", replace: "<blink>" }], "Done!");
  await ember.onRequest("Make the slip sparkle", broken(), broken(), broken());
  const ed = editor(page);
  await page.goto("/");

  await ed.send("Make the slip sparkle");

  await expect(ed.flintSays(/rewording/)).toBeVisible();
  await expect(ed.flintSays("Done!")).toHaveCount(0);
  await expect(ed.working.getByText(THANK_YOU)).toBeVisible();
});

test("the message box refuses more than 500 characters", async ({ page }) => {
  const ed = editor(page);
  await page.goto("/");

  await ed.input.fill("a".repeat(600));
  await expect(ed.input).toHaveValue("a".repeat(500));

  await ed.input.fill("b".repeat(499));
  await ed.input.pressSequentially("cde");
  await expect(ed.input).toHaveValue(`${"b".repeat(499)}c`);
});

test("both previews are sized to the template's paper", async ({ page }) => {
  const ed = editor(page);
  await page.goto("/");

  // Classic is Letter: laid out at 8.5in × 11in (96 CSS px per inch), then scaled to fit its pane.
  for (const frame of [ed.originalFrame, ed.workingFrame]) {
    await expect(frame).toHaveAttribute("data-paper", "letter");
    const layout = await frame.evaluate((el: HTMLElement) => ({ width: el.offsetWidth, height: el.offsetHeight }));
    expect(layout).toEqual({ width: 816, height: 1056 });
    const box = (await frame.boundingBox())!;
    expect(box.width / box.height).toBeCloseTo(8.5 / 11, 2);
  }
});
