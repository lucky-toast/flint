import { isAssetName, MAX_UPLOADED_ASSETS } from "../../core";

// Seller-uploaded images, kept as data URLs in localStorage, one entry per shop. They never leave
// the browser: turns send only their names.

/** About 200 KB per image, so a handful fit in localStorage. */
export const MAX_ASSET_BYTES = 200 * 1024;

export type UploadResult = { ok: true; name: string } | { ok: false; error: string };

/** The follow-up turn sent after an upload, so Flint carries on with the original request. */
export function uploadFollowUp(name: string): string {
  return `I've supplied the ${name} resource: it's now available as assets.${name}. Please carry on with my original request.`;
}

const storageKey =(shopId: string) => `flint-assets:${shopId}`;

/** The images this browser holds for a shop, by name. Unreadable or missing storage reads as none. */
export function loadUploadedAssets(shopId: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(storageKey(shopId));
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (e): e is [string, string] => isAssetName(e[0]) && typeof e[1] === "string" && e[1].startsWith("data:image/"),
      ),
    );
  } catch {
    return {};
  }
}

/** Why a name can't be used for a new upload, if it can't. */
export function assetNameProblem(name: string, shopAssets: Record<string, string>): string | undefined {
  if (!isAssetName(name)) {
    return "Names start with a letter and use only lowercase letters, numbers and _ (up to 32).";
  }
  if (name in shopAssets) return `Your shop already has an image called ${name}. Please pick another name.`;
  return undefined;
}

/** Suggests an asset name from a file name: "Eco Badge (1).png" → "eco_badge_1". */
export function suggestAssetName(fileName: string): string {
  const base = fileName
    .replace(/\.[^.]*$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[^a-z]+|_+$/g, "")
    .slice(0, 32)
    .replace(/_+$/, "");
  return base || "image";
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Checks and stores one uploaded image for a shop under `name` (replacing an earlier upload of that
 * name). Oversized images, bad names and storage failures come back as a friendly error, not stored.
 */
export async function saveUploadedAsset(
  shopId: string,
  shopAssets: Record<string, string>,
  file: File,
  name: string,
): Promise<UploadResult> {
  const nameProblem = assetNameProblem(name, shopAssets);
  if (nameProblem) return { ok: false, error: nameProblem };
  if (!file.type.startsWith("image/")) return { ok: false, error: "That file isn't an image. Please pick a PNG, JPG, GIF or SVG." };
  if (file.size > MAX_ASSET_BYTES) {
    return {
      ok: false,
      error: `That image is ${Math.ceil(file.size / 1024)} KB, over the ${MAX_ASSET_BYTES / 1024} KB limit. Please pick a smaller one.`,
    };
  }
  const existing = loadUploadedAssets(shopId);
  if (!(name in existing) && Object.keys(existing).length >= MAX_UPLOADED_ASSETS) {
    return { ok: false, error: `You can keep up to ${MAX_UPLOADED_ASSETS} images per shop.` };
  }

  let dataUrl: string;
  try {
    dataUrl = await readAsDataURL(file);
  } catch {
    return { ok: false, error: "That image couldn't be read. Please try another one." };
  }
  try {
    localStorage.setItem(storageKey(shopId), JSON.stringify({ ...existing, [name]: dataUrl }));
  } catch {
    return { ok: false, error: "Your browser's storage is full, so the image couldn't be saved. Try a smaller image." };
  }
  return { ok: true, name };
}
