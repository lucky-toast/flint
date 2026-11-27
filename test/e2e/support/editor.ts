import type { Page } from "@playwright/test";

/** Handles on the editor's panes and chat, shared by the browser tests. */
export function editor(page: Page) {
  const chat = page.getByRole("log", { name: "Chat with Flint" });
  const input = page.getByRole("textbox", { name: "Message Flint" });
  return {
    /** The original slip's document. */
    original: page.frameLocator('iframe[title="Original slip"]'),
    /** The working slip's document. */
    working: page.frameLocator('iframe[title="Working slip"]'),
    originalFrame: page.locator('iframe[title="Original slip"]'),
    workingFrame: page.locator('iframe[title="Working slip"]'),
    orderPicker: page.getByLabel("Example order"),
    /** The what-changed line and item warnings under the working slip. */
    whatChanged: page.getByRole("region", { name: "Working slip" }).getByTestId("what-changed"),
    missingItems: page.getByRole("region", { name: "Working slip" }).getByTestId("missing-items"),
    extraItems: page.getByRole("region", { name: "Working slip" }).getByTestId("extra-items"),
    chat,
    input,
    sendButton: page.getByRole("button", { name: "Send" }),
    thinking: page.getByText("Flint is thinking…"),
    // Undo and Redo hide (with their pill) while there's nothing to undo or redo; they're still there, disabled.
    undoButton: page.getByRole("button", { name: "Undo", includeHidden: true }),
    redoButton: page.getByRole("button", { name: "Redo", includeHidden: true }),
    /** The line above the message box while Redo has something to reapply. */
    redoWarning: page.getByText("Your next message clears Redo."),
    tryAgainButton: chat.getByRole("button", { name: "Try again" }),
    /** The chip above the message box naming what's selected on the working slip ("📍 About: …"). */
    selectionChip: page.getByRole("status", { name: "Selection" }),
    selectBiggerButton: page.getByRole("button", { name: "Select bigger" }),
    clearSelectionButton: page.getByRole("button", { name: "Clear selection" }),
    /** The tip above the message box while nothing is selected. */
    selectionTip: page.getByText("Tip: click part of the working slip to point at it."),
    /** The name tag over the part under the cursor, inside the working slip. */
    nameTag: page.frameLocator('iframe[title="Working slip"]').getByRole("tooltip"),
    /** The chat turn whose seller message contains this text. */
    turn: (text: string) => chat.locator(".turn", { has: page.locator('[data-author="seller"]', { hasText: text }) }),
    /** A message from Flint containing this text. */
    flintSays: (text: string | RegExp) => chat.locator('[data-author="flint"]', { hasText: text }),
    /** A message from the seller containing this text. */
    sellerSaid: (text: string | RegExp) => chat.locator('[data-author="seller"]', { hasText: text }),
    async send(message: string) {
      await input.fill(message);
      await page.getByRole("button", { name: "Send" }).click();
    },
  };
}
