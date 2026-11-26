import { useCallback, useSyncExternalStore } from "react";
import type { Paper, Shop, Template } from "../../core";
import { readSavedTemplates, writeSavedTemplates } from "./saved-templates";

// One cached list per shop, so every component sees the same array until a save changes it.
const cache = new Map<string, Template[]>();
const listeners = new Set<() => void>();

function changed(shopId?: string) {
  if (shopId) cache.delete(shopId);
  else cache.clear();
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Saves from another tab of the app.
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith("flint:templates:")) changed();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function snapshot(shopId: string): Template[] {
  let list = cache.get(shopId);
  if (!list) {
    list = readSavedTemplates(localStorage, shopId);
    cache.set(shopId, list);
  }
  return list;
}

/** Saves `source` as a new template for the shop and returns it. Throws a seller-readable Error if it can't be stored. */
export function saveAsNew(shop: Shop, draft: { name: string; paper: Paper; source: string }): Template {
  const template: Template = {
    id: `saved-${crypto.randomUUID()}`,
    name: draft.name,
    builtIn: false,
    paper: draft.paper,
    source: draft.source,
    updatedAt: new Date().toISOString(),
  };
  writeSavedTemplates(localStorage, shop.id, [...readSavedTemplates(localStorage, shop.id), template]);
  changed(shop.id);
  return template;
}

/**
 * Replaces the source of one of the shop's saved templates and returns it. Built-ins aren't in
 * the saved list, so they can never be overwritten. Throws if the template is gone or can't be stored.
 */
export function overwrite(shop: Shop, templateId: string, source: string): Template {
  const list = readSavedTemplates(localStorage, shop.id);
  const existing = list.find((t) => t.id === templateId);
  if (!existing) throw new Error("That template isn't saved in this browser any more.");
  const updated: Template = { ...existing, source, updatedAt: new Date().toISOString() };
  writeSavedTemplates(
    localStorage,
    shop.id,
    list.map((t) => (t.id === templateId ? updated : t)),
  );
  changed(shop.id);
  return updated;
}

/** The seller's saved templates for one shop, shown in the template picker beside the built-ins. */
export function useSavedTemplates(shop: Shop): Template[] {
  const get = useCallback(() => snapshot(shop.id), [shop.id]);
  return useSyncExternalStore(subscribe, get);
}
