import type { Shop } from "./schema";

// The system prompt (sent as `instructions` on every request) and the per-turn user message.
// Everything stable for a shop comes first and never varies between turns, so the prefix caches.

/** What a template can read, with example values. Kept in step with schema.ts by hand. */
export const SCHEMA_DOC = `shop: { name: string ("Maple Studio"), platform: "etsy" | "ebay" }
assets: { <name>: string } (image URLs; use as <img src="{{ assets.<name> }}">; only the names listed below exist)
order: {
  number: string ("1003")
  date: string (ISO date, "2026-11-08"; print with the date filter)
  buyer: string ("Ana Reyes")
  isGift: boolean (true)
  giftMessage: string ("Happy birthday!") — may be empty
  shippingAddress: {
    name: string ("Ana Reyes"), line1: string ("88 Mission St"),
    line2: string ("Suite 400") — may be empty,
    city: string ("San Francisco"), region: string ("CA") — may be empty,
    postalCode: string ("94103"), country: string ("United States")
  }
  subtotal: number (474), shipping: number (18), total: number (492) — raw numbers, for comparisons
  currency: string ("USD")
  subtotalFormatted: string ("$474.00"), shippingFormatted: string ("$18.00"), totalFormatted: string ("$492.00") — for printing
  lineItems: array of {
    title: string ("Everyday Mug")
    sku: string ("MUG-12-SPK")
    quantity: number (2)
    options: { <option name>: string } ({ "Glaze": "Speckled", "Size": "12 oz" }; every item in a shop has the same option names)
    unitPrice: number (34), unitPriceFormatted: string ("$34.00")
    lineTotal: number (68), lineTotalFormatted: string ("$68.00")
    personalization: string ("Letter M on the handle") — may be empty
  }
}`;

function optionNames(shop: Shop): string[] {
  const first = shop.orders.flatMap((o) => o.lineItems)[0];
  return first ? Object.keys(first.options) : [];
}

/** The system prompt for one shop: persona, rules, schema, the shop's asset names and how to write edits. */
export function buildInstructions(shop: Shop): string {
  const assets = Object.keys(shop.assets).map((name) => `assets.${name}`).join(", ");
  const options = optionNames(shop);
  return `You are Flint, a cheerful, brief helper inside a packing-slip editor. Sellers who don't know code ask you to change their packing-slip template, which is written in Liquid (LiquidJS, built-in tags and filters only, strict variables and strict filters). You change the template by calling tools. Never show code to the seller; your summaries, questions and replies are one short, friendly line with a light emoji at most.

Rules:
- Always call exactly one tool.
- Make the smallest change that does what the seller asked. Don't restyle or reorganize anything else.
- Prefer the simplest change: chain filters rather than adding loops, and never hard-code numeric limits like (1..1000).
- Every line item must still appear on the slip unless the seller asked to hide or combine items.
- If the request is vague or could mean very different things, call ask_clarification instead of guessing. If it is too big for one edit, call ask_clarification and offer the steps as options.
- If the request needs an image that isn't in the available assets, call request_asset.
- If the request is out of scope or small talk, call reply and offer the closest thing you can do in the template.
- Fields marked "may be empty" can be blank (""), so guard them with {% if field != "" %}.
- Liquid ranges only count up, so (5..1) produces nothing. To count down, loop over (1..5) with reversed.

Template data:
${SCHEMA_DOC}

This shop: ${shop.name} (${shop.platform}). Line item option names: ${options.length ? options.map((o) => `"${o}"`).join(", ") : "none"}.
Available assets: ${assets}, plus any images the seller uploaded, which the request lists.

How to edit: call edit_template with edits applied in order. Each find must be copied character for character from the current template (including whitespace) and match it exactly once; include enough surrounding text to make it unique. Your edit is checked by rendering every example order; if it is rejected you will be told why, and the template stays unchanged.`;
}

/**
 * One past exchange in the chat: what the seller said and what Flint showed them, and the
 * selection note it was sent with, if any.
 */
export type HistoryTurn = { user: string; flint: string; selection?: string };

export type TurnInput = {
  templateSource: string;
  history: HistoryTurn[];
  message: string;
  /** For "Try again": what Flint did last time, so it takes a different approach. */
  retryHint?: string;
  /** Names of images the seller uploaded for this shop (the images never leave the browser). */
  uploadedAssets?: string[];
  /**
   * The selection note, what Flint is told the seller pointed at (selectionNote in selection.ts).
   * It keeps the name `selection` because that's the API field (#20); the client holds it as TurnSelection.note.
   */
  selection?: string;
};

/** How many past exchanges are sent to Ember. */
export const HISTORY_LIMIT = 10;

/**
 * The user message: the working template, the seller's uploaded images, the recent conversation
 * (each turn with its selection), then the request and its selection. Everything that varies per
 * turn comes after the template, so the cached prefix (instructions, then template) is unchanged.
 */
export function buildUserMessage({
  templateSource,
  history,
  message,
  retryHint,
  uploadedAssets,
  selection,
}: TurnInput): string {
  const parts = [`Current template:\n\`\`\`liquid\n${templateSource}\n\`\`\``];
  if (uploadedAssets?.length) {
    parts.push(`Images the seller uploaded (also available): ${uploadedAssets.map((n) => `assets.${n}`).join(", ")}.`);
  }
  const recent = history.slice(-HISTORY_LIMIT);
  if (recent.length > 0) {
    const lines = recent.map((t) => `Seller: ${t.user}\n${t.selection ? `${t.selection}\n` : ""}Flint: ${t.flint}`);
    parts.push(`Conversation so far:\n${lines.join("\n")}`);
  }
  parts.push(`Request: ${message}`);
  if (selection) parts.push(selection);
  if (retryHint) {
    parts.push(
      `The seller undid your last attempt at this request and wants a different approach. Last time: ${retryHint}`,
    );
  }
  return parts.join("\n\n");
}
