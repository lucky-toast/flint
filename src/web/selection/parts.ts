import { LINE_ATTRIBUTE, POSITION_ATTRIBUTE } from "../../core";

// Finding parts in the working slip's preview document. A part is an element with a class; a
// section is a part directly inside the slip's root. Unnamed elements (like table rows) are never
// selectable, so anything finer than a part is described in words.

/** Words kept upper-case in part names ("SKU column"). */
const ACRONYMS = new Set(["sku", "id", "url", "qr"]);

/** The attribute on the elements the app injects into the preview document (the name tag). */
export const UI_ATTRIBUTE = "data-flint-ui";

/** The slip's root: the first element in the body that isn't a <style> or the app's own. */
export function slipRoot(doc: Document): Element | null {
  return [...doc.body.children].find((el) => el.tagName !== "STYLE" && !el.hasAttribute(UI_ATTRIBUTE)) ?? null;
}

function isPart(el: Element): boolean {
  return el.classList.length > 0;
}

/**
 * One part finer than `outer` towards `el`: the outermost part from `el` up to (not including)
 * `outer`. Null when `el` isn't inside `outer` or no part lies between them.
 */
export function partInside(el: Element, outer: Element): Element | null {
  if (el === outer || !outer.contains(el)) return null;
  let found: Element | null = null;
  for (let node: Element | null = el; node && node !== outer; node = node.parentElement) {
    if (isPart(node)) found = node;
  }
  return found;
}

/** The nearest part above `el`, below the root; null when `el` is a section. */
export function partAbove(el: Element, root: Element): Element | null {
  for (let node = el.parentElement; node && node !== root; node = node.parentElement) {
    if (isPart(node)) return node;
  }
  return null;
}

/** The sections: the outermost parts inside the root (normally the root's direct children). */
export function sections(root: Element): Element[] {
  return partsInside(root);
}

/** The parts exactly one level inside `outer`. */
export function partsInside(outer: Element): Element[] {
  return [...outer.querySelectorAll("[class]")].filter((el) => partInside(el, outer) === el);
}

/** A part's name, from its first class: "order-number" reads "Order number", td.col-sku "SKU column". */
export function partName(el: Element): string {
  const cls = el.classList[0] ?? el.tagName.toLowerCase();
  const words = cls
    .replace(/^(col|slip)-/, "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.toLowerCase()));
  const name = words.length ? words.join(" ") : cls;
  const capitalized = name[0]!.toUpperCase() + name.slice(1);
  return el.tagName === "TD" || el.tagName === "TH" ? `${capitalized} column` : capitalized;
}

/** Where a part's opening tag is in the template, from the instrumented preview. */
export function partPlace(el: Element): { line: number; position: number } | undefined {
  if (!el.hasAttribute(POSITION_ATTRIBUTE)) return undefined;
  const line = Number(el.getAttribute(LINE_ATTRIBUTE));
  const position = Number(el.getAttribute(POSITION_ATTRIBUTE));
  return Number.isInteger(line) && line > 0 && Number.isInteger(position) && position >= 0 ? { line, position } : undefined;
}

/** The elements rendered from the opening tag at `position` on template line `line`, in document order. */
export function renderedFrom(doc: Document, line: number, position: number): Element[] {
  return [...doc.querySelectorAll(`[${LINE_ATTRIBUTE}="${line}"][${POSITION_ATTRIBUTE}="${position}"]`)];
}
