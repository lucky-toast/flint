import { editCall, emberDown, expect, replyCall, test } from "./support/ember";
import { editor } from "./support/editor";

const THANK_YOU = "Thank you for supporting";

test("Undo restores the previous working slip and marks the turn undone", async ({ page, ember }) => {
  await ember.onRequest(
    "Say cheers on the thank-you line (undo)",
    editCall([{ find: "Thank you for supporting", replace: "Cheers for supporting" }], "It says cheers now 🥂"),
  );
  const ed = editor(page);
  await page.goto("/");
  // Undo and Redo float on the working slip only while there's something to undo or redo.
  const history = page.getByRole("region", { name: "Working slip" }).getByRole("group", { name: "History", includeHidden: true });
  await expect(ed.undoButton).toBeDisabled();
  await expect(history).toBeHidden();

  await ed.send("Say cheers on the thank-you line (undo)");
  await expect(ed.working.getByText("Cheers for supporting")).toBeVisible();
  await expect(history).toBeVisible();

  await ed.undoButton.click();

  await expect(ed.working.getByText(THANK_YOU)).toBeVisible();
  await expect(ed.working.getByText("Cheers for supporting")).toHaveCount(0);
  const turn = ed.turn("Say cheers on the thank-you line (undo)");
  await expect(turn).toHaveAttribute("data-undone", "true");
  await expect(turn.getByText("Undone")).toBeVisible();
  // The turn stays in the chat.
  await expect(ed.flintSays("It says cheers now 🥂")).toBeVisible();
  await expect(ed.undoButton).toBeDisabled();
});

test("undone turns and Flint's error replies are left out of the history sent to Ember", async ({ page, ember }) => {
  await ember.onRequest(
    "Call the buyer the recipient (history)",
    editCall([{ find: "<div>Buyer:", replace: "<div>Recipient:" }], "Buyers are recipients now 📬"),
  );
  await ember.onRequest(
    "Make the gift box purple (history)",
    editCall([{ find: "border: 1px dashed #b5532f", replace: "border: 1px dashed #6b3fa0" }], "Purple gift box 💜"),
  );
  await ember.onRequest("Add a moon by the logo (history)", emberDown());
  const last = await ember.onRequest(
    "Bold the order number (history)",
    editCall([{ find: "Order #{{ order.number | escape }}", replace: "<b>Order #{{ order.number | escape }}</b>" }], "Bold it is 💪"),
  );
  const ed = editor(page);
  await page.goto("/");

  await ed.send("Call the buyer the recipient (history)");
  await expect(ed.flintSays("Buyers are recipients now 📬")).toBeVisible();
  await ed.send("Make the gift box purple (history)");
  await expect(ed.flintSays("Purple gift box 💜")).toBeVisible();
  await ed.undoButton.click();
  await expect(ed.turn("Make the gift box purple (history)")).toHaveAttribute("data-undone", "true");
  await ed.send("Add a moon by the logo (history)");
  await expect(ed.flintSays("Flint is resting")).toBeVisible();
  await ed.send("Bold the order number (history)");
  await expect(ed.flintSays("Bold it is 💪")).toBeVisible();

  const [call] = await last.calls();
  const userMessage: string = call.input[0].content;
  expect(userMessage).toContain("Seller: Call the buyer the recipient (history)\nFlint: Buyers are recipients now 📬");
  expect(userMessage).not.toContain("purple");
  expect(userMessage).not.toContain("Purple");
  expect(userMessage).not.toContain("moon");
  expect(userMessage).not.toContain("resting");
  // The undone edit's template change is gone too.
  expect(userMessage).toContain("border: 1px dashed #b5532f");
});

test("Try again replaces Flint's previous reply with a new one and sends the retry hint", async ({ page, ember }) => {
  const request = "Make the footer friendlier (try again)";
  await ember.onRequest(
    request,
    editCall([{ find: "Thank you for supporting", replace: "Big hugs for supporting" }], "Sent big hugs in the footer 🤗"),
  );
  // Longer than the request's own match, so it wins once the retry hint is in the message.
  const retry = await ember.script(
    { match: "wants a different approach. Last time: Sent big hugs in the footer 🤗" },
    request,
    editCall([{ find: "Thank you for supporting", replace: "You're the best for supporting" }], "Told them they're the best 🌟"),
  );
  const ed = editor(page);
  await page.goto("/");
  await expect(ed.tryAgainButton).toHaveCount(0);

  await ed.send(request);
  await expect(ed.working.getByText("Big hugs for supporting")).toBeVisible();

  await ed.tryAgainButton.click();

  await expect(ed.flintSays("Told them they're the best 🌟")).toBeVisible();
  await expect(ed.flintSays("Sent big hugs in the footer 🤗")).toHaveCount(0);
  await expect(ed.sellerSaid(request)).toHaveCount(1);
  await expect(ed.working.getByText("You're the best for supporting")).toBeVisible();
  await expect(ed.working.getByText("Big hugs")).toHaveCount(0);

  const [call] = await retry.calls();
  const userMessage: string = call.input[0].content;
  expect(userMessage).toContain(`Request: ${request}`);
  expect(userMessage).toContain("different approach");
  // Flint retries against the slip before its rejected edit, and doesn't see that edit in the history.
  expect(userMessage).toContain(THANK_YOU);
  expect(userMessage).not.toContain("Big hugs for supporting");
  expect(userMessage).not.toContain("Seller: Make the footer friendlier");

  // One undo steps back past the retried edit to the original.
  await ed.undoButton.click();
  await expect(ed.working.getByText(THANK_YOU)).toBeVisible();
});

test("a failed Try again keeps the previous edit and says why", async ({ page, ember }) => {
  const request = "Warm up the footer (failed try again)";
  await ember.onRequest(
    request,
    editCall([{ find: "Thank you for supporting", replace: "Warm thanks for supporting" }], "Warmed up the footer ☀️"),
  );
  await ember.script({ match: "wants a different approach. Last time: Warmed up the footer ☀️" }, request, emberDown());
  const ed = editor(page);
  await page.goto("/");

  await ed.send(request);
  await expect(ed.working.getByText("Warm thanks for supporting")).toBeVisible();
  await ed.tryAgainButton.click();

  await expect(ed.flintSays("Flint is resting")).toBeVisible();
  await expect(ed.flintSays("Warmed up the footer ☀️")).toBeVisible();
  await expect(ed.working.getByText("Warm thanks for supporting")).toBeVisible();
  // The kept edit can still be undone.
  await ed.undoButton.click();
  await expect(ed.working.getByText(THANK_YOU)).toBeVisible();
});

test("Try again works after a summary longer than a message", async ({ page, ember }) => {
  const request = "Make the footer cosy (long summary)";
  const summary = `Made the footer cosy 🧣 ${"and very snug ".repeat(45)}TAIL-OF-SUMMARY`;
  await ember.onRequest(request, editCall([{ find: "Thank you for supporting", replace: "Cosy thanks for supporting" }], summary));
  const retry = await ember.script(
    { match: "wants a different approach. Last time: Made the footer cosy 🧣" },
    request,
    editCall([{ find: "Thank you for supporting", replace: "Snug thanks for supporting" }], "Snug instead 🛌"),
  );
  const ed = editor(page);
  await page.goto("/");

  await ed.send(request);
  await expect(ed.working.getByText("Cosy thanks for supporting")).toBeVisible();
  await ed.tryAgainButton.click();

  await expect(ed.flintSays("Snug instead 🛌")).toBeVisible();
  await expect(ed.working.getByText("Snug thanks for supporting")).toBeVisible();
  const [call] = await retry.calls();
  expect(call.input[0].content).not.toContain("TAIL-OF-SUMMARY");
});

test("Undo enables Redo and warns that the next message clears it", async ({ page, ember }) => {
  await ember.onRequest(
    "Say cheers on the thank-you line (redo warning)",
    editCall([{ find: "Thank you for supporting", replace: "Cheers for supporting" }], "It says cheers now 🥂"),
  );
  const ed = editor(page);
  await page.goto("/");
  await expect(ed.redoButton).toBeDisabled();
  await expect(ed.redoWarning).toHaveCount(0);

  await ed.send("Say cheers on the thank-you line (redo warning)");
  await expect(ed.working.getByText("Cheers for supporting")).toBeVisible();
  await expect(ed.redoButton).toBeDisabled();

  await ed.undoButton.click();

  await expect(ed.redoButton).toBeEnabled();
  await expect(ed.redoWarning).toBeVisible();
});

test("Redo brings the undone edit back and removes the Undone mark", async ({ page, ember }) => {
  const request = "Say cheers on the thank-you line (redo)";
  await ember.onRequest(
    request,
    editCall([{ find: "Thank you for supporting", replace: "Cheers for supporting" }], "It says cheers now 🥂"),
  );
  const ed = editor(page);
  await page.goto("/");

  await ed.send(request);
  await expect(ed.working.getByText("Cheers for supporting")).toBeVisible();
  await ed.undoButton.click();
  await expect(ed.working.getByText(THANK_YOU)).toBeVisible();

  await ed.redoButton.click();

  await expect(ed.working.getByText("Cheers for supporting")).toBeVisible();
  const turn = ed.turn(request);
  await expect(turn).not.toHaveAttribute("data-undone", "true");
  await expect(turn.getByText("Undone")).toHaveCount(0);
  await expect(ed.redoButton).toBeDisabled();
  await expect(ed.redoWarning).toHaveCount(0);
  // As before the Undo: Try again is back and the edit can be undone again.
  await expect(ed.tryAgainButton).toBeVisible();
  await expect(ed.undoButton).toBeEnabled();
});

test("sending after Undo clears Redo and the undone turn stays undone", async ({ page, ember }) => {
  const request = "Say cheers on the thank-you line (redo cleared)";
  await ember.onRequest(
    request,
    editCall([{ find: "Thank you for supporting", replace: "Cheers for supporting" }], "It says cheers now 🥂"),
  );
  await ember.onRequest("What font is this? (redo cleared)", replyCall("It's a serif 🖋️"));
  const ed = editor(page);
  await page.goto("/");

  await ed.send(request);
  await expect(ed.working.getByText("Cheers for supporting")).toBeVisible();
  await ed.undoButton.click();
  await expect(ed.redoButton).toBeEnabled();

  await ed.send("What font is this? (redo cleared)");
  await expect(ed.flintSays("It's a serif 🖋️")).toBeVisible();

  await expect(ed.redoButton).toBeDisabled();
  await expect(ed.redoWarning).toHaveCount(0);
  await expect(ed.turn(request)).toHaveAttribute("data-undone", "true");
  await expect(ed.turn(request).getByText("Undone")).toBeVisible();
});
