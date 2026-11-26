import type { TurnErrorCode, TurnResult } from "../../core";

// What Flint says in the chat for each outcome. Cheerful, brief, never about code.

export const ERROR_MESSAGES: Record<TurnErrorCode, string> = {
  too_big: "That's a lot for one go 😅 Could you break it into smaller steps, one change at a time?",
  invalid: "Hmm, I couldn't make that work for every order 🤔 Could you try rewording it?",
  // The Worker still answers the scripted demo requests from replay while live is resting.
  resting:
    "Flint is resting right now 😴 Please try again in a little while. Meanwhile, the demo requests on Kiln & Co. still work, like “Sort items by quantity, then SKU”.",
  too_long: "That request was too long for me 😅 Could you try something shorter?",
};

/** The one line Flint shows for a turn's outcome (also what Ember sees of it in the history). */
export function flintText(result: TurnResult): string {
  switch (result.type) {
    case "edit":
      return result.summary;
    case "ask":
      return result.question;
    case "asset":
      return result.description;
    case "reply":
      return result.message;
    case "error":
      return ERROR_MESSAGES[result.error];
  }
}
