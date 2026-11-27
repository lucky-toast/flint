import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { selectionNote, type SelectedPart } from "../../core";
import type { TurnSelection } from "../session/session";
import { partAbove, partInside, partName, partPlace, partsInside, renderedFrom, slipRoot, UI_ATTRIBUTE } from "./parts";

// Pointing at the working slip. The working slip renders an instrumented copy of the template
// (every opening tag carries its source line and its position on that line), and this hook listens to its same-origin preview
// document from the app, the way link-blocking does: the slip's sandbox and CSP are unchanged, so
// nothing runs inside it. Hover boxes, the name tag and the selected outline are styles and one
// element injected into the preview document only, for the screen, never for print.

/**
 * The selection, by where it comes from in the template (its opening tag's line and position), and
 * which of the elements rendered from that tag it is, for the outline when the template repeats it.
 */
type SelectedPartRef = SelectedPart & { index: number };

const PICKABLE = "data-flint-pickable";
const HOVER = "data-flint-hover";
const SELECTED = "data-flint-selected";
const POINTING = "data-flint-pointing";

/**
 * The styles injected into the slip. Their colour is the app's --selection token (styles.css), read
 * from the app's document and passed in, since the slip is a document of its own.
 */
const frameStyle = (accent: string) => `
@media screen {
  :root { --flint-selection: ${accent}; }
  body[${POINTING}] [${PICKABLE}] { outline: 1px dashed color-mix(in srgb, var(--flint-selection) 45%, transparent); outline-offset: 2px; }
  [${HOVER}] { outline: 2px dashed var(--flint-selection) !important; outline-offset: 2px; cursor: pointer; }
  [${SELECTED}] { outline: 2px solid var(--flint-selection) !important; outline-offset: 2px;
    background-color: color-mix(in srgb, var(--flint-selection) 7%, transparent) !important; }
  [${UI_ATTRIBUTE}] { position: absolute; z-index: 2147483647; margin: 0; background: var(--flint-selection); color: #fff;
    font: 600 15px/1 system-ui, sans-serif; padding: 5px 8px; border-radius: 4px 4px 0 0; pointer-events: none; white-space: nowrap; }
}
@media print { [${UI_ATTRIBUTE}] { display: none !important; } }
`;

function elementOf(doc: Document, selectedPart: SelectedPartRef): Element | null {
  const all = renderedFrom(doc, selectedPart.line, selectedPart.position);
  return all[selectedPart.index] ?? all[0] ?? null;
}

function clearMark(doc: Document, attr: string) {
  doc.querySelectorAll(`[${attr}]`).forEach((e) => e.removeAttribute(attr));
}

export type SlipSelectionApi = {
  /** What's selected, as it goes with the next message. */
  selection: TurnSelection | undefined;
  /** Whether Select bigger has a part to go to. */
  canSelectBigger: boolean;
  selectBigger: () => void;
  clear: () => void;
  /** For the working slip's preview frame: called with each freshly loaded document. */
  onDocument: (doc: Document) => void;
};

/** Selection on the working slip, whose template is `source`. */
export function useSlipSelection(source: string): SlipSelectionApi {
  const [selectedPart, setSelectedPart] = useState<SelectedPartRef | null>(null);
  const [doc, setDoc] = useState<Document | null>(null);
  const selectedRef = useRef(selectedPart);
  selectedRef.current = selectedPart;
  const sourceRef = useRef(source);
  sourceRef.current = source;
  /** The element under the cursor, so the hover box can follow a click without a mouse move. */
  const under = useRef<Element | null>(null);

  // A new template (an accepted edit, Undo, Redo, Try again) re-renders the slip: the selection
  // clears rather than point at code that has changed. It stays in the history Flint sees.
  useEffect(() => {
    setSelectedPart((current) => (current && current.source !== source ? null : current));
  }, [source]);

  const clear = useCallback(() => setSelectedPart(null), []);

  const selectPart = useCallback((el: Element) => {
    const place = partPlace(el);
    if (!place) return;
    setSelectedPart({
      source: sourceRef.current,
      ...place,
      index: renderedFrom(el.ownerDocument, place.line, place.position).indexOf(el),
      name: partName(el),
    });
  }, []);

  /** The part a click on `el` would select: one finer inside the selection, else its section. */
  const partToSelect = useCallback((d: Document, el: Element | null): Element | null => {
    const root = slipRoot(d);
    if (!root || !el) return null;
    const current = selectedRef.current;
    const selected = current ? elementOf(d, current) : null;
    if (selected && (el === selected || selected.contains(el))) return partInside(el, selected) ?? selected;
    return partInside(el, root);
  }, []);

  const showHover = useCallback(
    (d: Document) => {
      clearMark(d, HOVER);
      const tag = d.querySelector<HTMLElement>(`[${UI_ATTRIBUTE}]`);
      const target = partToSelect(d, under.current);
      if (!tag) return;
      if (!target) {
        tag.hidden = true;
        return;
      }
      target.setAttribute(HOVER, "");
      const box = target.getBoundingClientRect();
      const view = d.defaultView!;
      tag.textContent = partName(target);
      tag.style.left = `${box.left + view.scrollX - 2}px`;
      tag.style.top = `${Math.max(0, box.top + view.scrollY - 26)}px`;
      tag.hidden = false;
    },
    [partToSelect],
  );
  const showHoverRef = useRef(showHover);
  showHoverRef.current = showHover;

  const onDocument = useCallback(
    (d: Document) => {
      const style = d.createElement("style");
      style.textContent = frameStyle(getComputedStyle(document.documentElement).getPropertyValue("--selection").trim());
      // In the body, after the slip, so the head keeps only the page setup.
      d.body.appendChild(style);
      const tag = d.createElement("div");
      tag.setAttribute(UI_ATTRIBUTE, "");
      tag.setAttribute("role", "tooltip");
      tag.hidden = true;
      d.body.appendChild(tag);

      d.addEventListener("mouseover", (e) => {
        d.body.setAttribute(POINTING, "");
        under.current = e.target as Element;
        showHoverRef.current(d);
      });
      d.documentElement.addEventListener("mouseleave", () => {
        d.body.removeAttribute(POINTING);
        under.current = null;
        showHoverRef.current(d);
      });
      d.addEventListener("click", (e) => {
        const target = partToSelect(d, e.target as Element);
        const current = selectedRef.current;
        if (!target || (current && target === elementOf(d, current))) setSelectedPart(null);
        else selectPart(target);
      });

      under.current = null;
      // A fresh render of a part that's gone (or a render without source lines) drops the selection.
      const current = selectedRef.current;
      if (current && !elementOf(d, current)) setSelectedPart(null);
      setDoc(d);
    },
    [partToSelect, selectPart],
  );

  const selected = doc && selectedPart ? elementOf(doc, selectedPart) : null;
  const root = doc ? slipRoot(doc) : null;

  // Mark the selection and what can be selected now: the sections, and the parts one level inside the selection.
  useEffect(() => {
    if (!doc) return;
    clearMark(doc, SELECTED);
    clearMark(doc, PICKABLE);
    selected?.setAttribute(SELECTED, "");
    // The parts inside the root are the sections.
    const pickable = root ? [...partsInside(root), ...(selected ? partsInside(selected) : [])] : [];
    for (const el of pickable) el.setAttribute(PICKABLE, "");
    showHover(doc);
  }, [doc, selected, root, showHover]);

  const bigger = selected && root ? partAbove(selected, root) : null;
  const selectBigger = useCallback(() => {
    if (bigger) selectPart(bigger);
  }, [bigger, selectPart]);

  const selection = useMemo(
    () => (selectedPart ? { name: selectedPart.name, note: selectionNote(selectedPart) } : undefined),
    [selectedPart],
  );

  return { selection, canSelectBigger: !!bigger, selectBigger, clear, onDocument };
}
