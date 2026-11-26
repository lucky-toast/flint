import type { Shop } from "./schema";
import { placeholderAssets } from "./validate";

// Seller-uploaded images. The images themselves stay in the browser; turns carry only their names,
// and the Worker stands in placeholder images so templates that use them validate.

/** How many uploaded asset names one turn may carry. */
export const MAX_UPLOADED_ASSETS = 20;

/** Asset names are plain identifiers so `assets.<name>` works in Liquid: a letter, then letters, digits or _. */
export const ASSET_NAME_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;

export function isAssetName(value: unknown): value is string {
  return typeof value === "string" && ASSET_NAME_PATTERN.test(value);
}

/** The follow-up turn sent after an upload, so Flint carries on with the original request. */
export function uploadFollowUp(name: string): string {
  return `I've supplied the ${name} resource: it's now available as assets.${name}. Please carry on with my original request.`;
}

/** The uploaded name in an uploadFollowUp message, if the message is one (replay answers it). */
export function uploadFollowUpName(message: string): string | undefined {
  const match = /^I've supplied the ([a-z][a-z0-9_]{0,31}) resource: /.exec(message.trim());
  return match?.[1];
}

/** The shop as the Worker sees it for a turn: its own assets plus placeholders for the uploaded names. */
export function withUploadedAssets(shop: Shop, names: string[] | undefined): Shop {
  if (!names?.length) return shop;
  return { ...shop, assets: { ...placeholderAssets(names), ...shop.assets } };
}
