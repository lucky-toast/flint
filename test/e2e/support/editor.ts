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
    chat,
    input,
    sendButton: page.getByRole("button", { name: "Send" }),
    thinking: page.getByText("Flint is thinking…"),
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
