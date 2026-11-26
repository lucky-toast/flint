import type { Paper, Template } from "../../core";

// The seller's saved templates, kept in this browser's localStorage, one list per shop.
// Built-in templates live in src/data and are never stored or overwritten here.

const PAPERS: readonly Paper[] = ["letter", "a4", "4x6"];

/** Every shop's list is stored under this prefix plus the shop id. */
export const STORAGE_PREFIX = "flint:templates:";

export function storageKey(shopId: string): string {
  return `${STORAGE_PREFIX}${shopId}`;
}

function isTemplate(value: unknown): value is Template {
  const t = value as Partial<Template> | null;
  return (
    !!t &&
    typeof t.id === "string" &&
    typeof t.name === "string" &&
    typeof t.source === "string" &&
    typeof t.updatedAt === "string" &&
    PAPERS.includes(t.paper as Paper)
  );
}

/** The shop's saved templates, or none when storage is empty, unreadable or holds something else. */
export function readSavedTemplates(storage: Storage, shopId: string): Template[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(storageKey(shopId)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isTemplate).map((t) => ({ ...t, builtIn: false })) : [];
  } catch {
    return [];
  }
}

/** Writes the shop's list. Throws a seller-readable Error when the browser refuses (e.g. storage full). */
export function writeSavedTemplates(storage: Storage, shopId: string, templates: Template[]): void {
  try {
    storage.setItem(storageKey(shopId), JSON.stringify(templates));
  } catch {
    throw new Error("This browser's storage is full or turned off, so the template couldn't be saved.");
  }
}

/** A name for "Save as new" that none of the shop's saved templates already uses: "Classic copy", "Classic copy 2"… */
export function suggestedName(from: string, saved: Template[]): string {
  const base = `${from.replace(/ copy( \d+)?$/, "")} copy`;
  const taken = new Set(saved.map((t) => t.name));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

/** A file name for downloading a template: its name, lowercased and dashed, as .liquid. */
export function liquidFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "template"}.liquid`;
}
