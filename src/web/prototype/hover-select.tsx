// PROTOTYPE (issue #20), throwaway: never merge into main.
// Question: how should "point at part of the slip instead of describing it" behave?
// Round 2: Toast landed between "exact element" and "whole sections only", so all three variants
// select named parts (elements with a class) at more than one size, and differ in how you get from
// a big part to a small one. Switch with ?variant=A|B|C (no param: prototype off).
//
//   A  Drill in        Hover and click pick whole sections. Click inside the selected section to
//                      narrow to the named part under the cursor; "Select bigger" steps back out.
//   B  Smallest first  Hover and click pick the smallest named part under the cursor;
//                      "Select bigger" widens to the named part around it.
//   C  Section + parts Click picks a section; its named parts are listed as buttons on the chip.
//                      Hovering a button highlights that part; clicking it narrows the selection.
//
// While the cursor is over the slip, every region you could select right now shows a faint box.
// In every variant Flint gets the part's name and its first line in the template, quoted verbatim,
// so it can copy it into an edit (Flint edits by exact find/replace and never sees line numbers).
//
// Finding that line: the working slip renders an instrumented copy of the template where every
// opening tag carries data-flint-line="N" (preview only: never saved, never sent to Flint). A click
// knows its exact source line; if that line's text appears more than once in the template, the
// quote grows by following lines until it is unique (the same rule as Flint's find/replace). When one
// line renders many elements (a loop), Flint is told it repeats.
//
// A seeded saved template, "Look-alike test (prototype)" for Kiln & Co., has two identical
// <section class="addresses"><div class="ship-to"> blocks to try this on.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MAX_MESSAGE_LENGTH } from "../../core";
import { classic } from "../../data/templates/classic";

/** Preview-only copy of the template: every opening tag carries its 1-based source line. */
export function instrumentSource(source: string): string {
  return source
    .split("\n")
    .map((line, i) => line.replace(/<([a-zA-Z][a-zA-Z0-9]*)(?=[\s>\/])/g, `<$1 data-flint-line="${i + 1}"`))
    .join("\n");
}

/** Seeds a Kiln & Co. saved template with two look-alike sections, once. */
function seedLookalike() {
  const key = "flint:templates:kiln-and-co";
  const list = JSON.parse(localStorage.getItem(key) ?? "[]") as { id: string }[];
  if (list.some((t) => t.id === "proto-lookalike")) return;
  const returnTo = `
  <section class="addresses">
    <div class="ship-to">
      <h2>Return to</h2>
      <p>{{ shop.name | escape }}<br>12 Clay Lane<br>Asheville, NC 28801</p>
    </div>
  </section>
`;
  const source = classic.source.replace("\n  {% assign items", `${returnTo}
  {% assign items`);
  list.push({ ...classic, id: "proto-lookalike", name: "Look-alike test (prototype)", builtIn: false, source } as never);
  localStorage.setItem(key, JSON.stringify(list));
}
if (new URLSearchParams(location.search).has("variant")) seedLookalike();

export type Variant = "A" | "B" | "C";
const VARIANTS: Variant[] = ["A", "B", "C"];
const NAMES: Record<Variant, string> = { A: "Drill in", B: "Smallest first", C: "Section + parts" };

type Picked = { label: string; path: number[]; context: string };

const ACCENT = "#e8590c";
const FRAME_STYLE = `
body.proto-over [data-proto-region] { outline: 1px dashed rgb(232 89 12 / 0.45); outline-offset: 2px; }
[data-proto-hover] { outline: 2px dashed ${ACCENT} !important; outline-offset: 2px; cursor: pointer; }
[data-proto-selected] { outline: 2px solid ${ACCENT} !important; outline-offset: 2px; background-color: rgb(232 89 12 / 0.07) !important; }
.proto-tag { position: absolute; z-index: 9999; background: ${ACCENT}; color: #fff; font: 600 13px/1 system-ui, sans-serif;
  padding: 5px 8px; border-radius: 4px 4px 0 0; pointer-events: none; white-space: nowrap; }
`;

/** Message plus selection line, kept under the message cap (the message gives way). */
function withContext(message: string, context: string): string {
  return `${message.slice(0, MAX_MESSAGE_LENGTH - context.length - 1)}\n${context}`;
}

function readVariant(): Variant | null {
  const v = new URLSearchParams(location.search).get("variant");
  return VARIANTS.includes(v as Variant) ? (v as Variant) : null;
}

function classesOf(el: Element): string[] {
  return [...el.classList].filter((c) => !c.startsWith("proto"));
}

function labelFor(el: Element): string {
  const cls = classesOf(el)[0];
  if (!cls) return el.tagName.toLowerCase();
  const words = cls.replace(/^(col|slip)-/, "").replace(/[-_]+/g, " ").trim();
  const name = words ? words[0]!.toUpperCase() + words.slice(1) : cls;
  return el.tagName === "TD" || el.tagName === "TH" ? `${name} column` : name;
}

/** Child-index path from <body>, so the same element can be found again after a re-render. */
function pathOf(el: Element): number[] {
  const path: number[] = [];
  let node: Element | null = el;
  while (node && node.parentElement && node.tagName !== "BODY") {
    path.unshift([...node.parentElement.children].indexOf(node));
    node = node.parentElement;
  }
  return path;
}

function atPath(doc: Document, path: number[]): Element | null {
  let node: Element | null = doc.body;
  for (const i of path) node = node?.children[i] ?? null;
  return node;
}

/** The slip's root: the first element in <body> that isn't a <style> or our tag. */
function slipRoot(doc: Document): Element | null {
  return [...doc.body.children].find((c) => c.tagName !== "STYLE" && !c.classList.contains("proto-tag")) ?? null;
}

/** Whole sections: the slip root's children. */
function sections(root: Element | null): Element[] {
  return [...(root?.children ?? [])].filter((c) => c.tagName !== "STYLE");
}

function sectionOf(el: Element, root: Element | null): Element | null {
  let node: Element | null = el;
  while (node && node.parentElement && node.parentElement !== root) {
    if (node.tagName === "BODY") return null;
    node = node.parentElement;
  }
  return node && node !== root && node.tagName !== "BODY" ? node : null;
}

/** The nearest element with a class, from el up to (and including) `stop`'s child. */
function nearestNamed(el: Element, stop: Element | null): Element | null {
  let node: Element | null = el;
  while (node && node !== stop && node.tagName !== "BODY") {
    if (classesOf(node).length) return node;
    node = node.parentElement;
  }
  return null;
}

/** The named parts inside an element (elements with a class), one per distinct class, in order. */
function namedParts(el: Element): Element[] {
  const seen = new Set<string>();
  return [...el.querySelectorAll("[class]")].filter((e) => {
    const cls = classesOf(e)[0];
    if (!cls || seen.has(cls)) return false;
    seen.add(cls);
    return true;
  });
}

/** The shortest run of source lines starting at `start` (0-based) whose text occurs once in the source. */
function uniqueSnippet(lines: string[], start: number): string {
  const source = lines.join("\n");
  for (let end = start; end < lines.length; end++) {
    const snippet = lines.slice(start, end + 1).join("\n");
    if (source.indexOf(snippet) === source.lastIndexOf(snippet)) return snippet;
  }
  return lines.slice(start).join("\n");
}

/** Flint gets the part's name and its template line(s), verbatim and unique, from the instrumented render. */
function sourceContext(el: Element, source: string): string {
  const n = Number(el.getAttribute("data-flint-line"));
  const lines = source.split("\n");
  const name = `"${labelFor(el)}"`;
  if (!n || !lines[n - 1]) return `(The seller selected the ${name} part of the slip.)`;
  const snippet = uniqueSnippet(lines, n - 1)
    .split("\n")
    .map((l) => l.trim())
    .join(" ⏎ ")
    .slice(0, 260);
  // Flint never sees the example orders, so a count means nothing to it. Say it repeats, and which copy was clicked.
  const sameTag = [...el.ownerDocument.querySelectorAll(`[data-flint-line="${n}"]`)].filter((e) => e.tagName === el.tagName);
  const shown = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  const repeatNote =
    sameTag.length > 1 ? ` It is repeated by a loop; the seller clicked the copy showing "${shown}".` : "";
  return `(The seller selected the ${name} part of the slip. In the template it is: ${snippet}.${repeatNote})`;
}

function clearMark(doc: Document, attr: string) {
  doc.querySelectorAll(`[${attr}]`).forEach((e) => e.removeAttribute(attr));
}

export function useHoverSelectPrototype(send: (message: string) => void, source: string) {
  const [variant, setVariant] = useState<Variant | null>(readVariant);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [doc, setDoc] = useState<Document | null>(null);
  const pickedRef = useRef(picked);
  pickedRef.current = picked;
  const sourceRef = useRef(source);
  sourceRef.current = source;

  const describe = useCallback((el: Element): Picked => {
    return { label: labelFor(el), path: pathOf(el), context: sourceContext(el, sourceRef.current) };
  }, []);

  const choose = useCallback(
    (v: Variant) => {
      const url = new URL(location.href);
      url.searchParams.set("variant", v);
      history.replaceState(null, "", url);
      setVariant(v);
      setPicked(null);
      if (doc) {
        clearMark(doc, "data-proto-selected");
        clearMark(doc, "data-proto-hover");
      }
    },
    [doc],
  );

  // ← and → cycle variants, except while typing.
  useEffect(() => {
    if (!variant) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const i = VARIANTS.indexOf(variant);
      choose(VARIANTS[(i + (e.key === "ArrowRight" ? 1 : VARIANTS.length - 1)) % VARIANTS.length]!);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant, choose]);

  const selectedEl = doc && picked ? atPath(doc, picked.path) : null;
  const root = doc ? slipRoot(doc) : null;

  // Mark the selection and the regions selectable right now.
  useEffect(() => {
    if (!doc || !variant) return;
    clearMark(doc, "data-proto-selected");
    clearMark(doc, "data-proto-region");
    selectedEl?.setAttribute("data-proto-selected", "");
    let regions: Element[];
    if (variant === "B") regions = root ? [...root.querySelectorAll("[class]")].filter((e) => classesOf(e).length) : [];
    else if (variant === "A" && selectedEl) regions = [...sections(root), ...namedParts(selectedEl)];
    else regions = sections(root);
    for (const r of regions) r.setAttribute("data-proto-region", "");
  }, [doc, variant, selectedEl, root]);

  // Which element the cursor points at, per variant.
  const targetRef = useRef<(el: Element) => Element | null>(() => null);
  targetRef.current = (el: Element) => {
    if (!root) return null;
    if (variant === "B") return nearestNamed(el, root);
    if (variant === "A" && selectedEl && selectedEl.contains(el) && el !== selectedEl) {
      // Inside the selection: the named part under the cursor, one level finer than the selection.
      return nearestNamed(el, selectedEl) ?? sectionOf(el, root);
    }
    return sectionOf(el, root);
  };

  const onWorkingDocument = useCallback(
    (d: Document) => {
      if (!variant) return;
      const style = d.createElement("style");
      style.textContent = FRAME_STYLE;
      d.head.appendChild(style);
      const tag = d.createElement("div");
      tag.className = "proto-tag";
      tag.hidden = true;
      d.body.appendChild(tag);
      d.documentElement.addEventListener("mouseenter", () => d.body.classList.add("proto-over"));
      d.documentElement.addEventListener("mouseleave", () => {
        d.body.classList.remove("proto-over");
        clearMark(d, "data-proto-hover");
        tag.hidden = true;
      });
      d.addEventListener("mouseover", (e) => {
        clearMark(d, "data-proto-hover");
        tag.hidden = true;
        const el = targetRef.current(e.target as Element);
        if (!el) return;
        el.setAttribute("data-proto-hover", "");
        const r = el.getBoundingClientRect();
        tag.textContent = labelFor(el);
        tag.style.left = `${r.left + d.defaultView!.scrollX - 2}px`;
        tag.style.top = `${r.top + d.defaultView!.scrollY - 24}px`;
        tag.hidden = false;
      });
      d.addEventListener("click", (e) => {
        const el = targetRef.current(e.target as Element);
        if (!el) return setPicked(null);
        const next = describe(el);
        setPicked((cur) => (cur && cur.path.join() === next.path.join() ? null : next));
      });
      // A fresh document (after an edit or order switch): drop a selection that's no longer there.
      const cur = pickedRef.current;
      if (cur && !atPath(d, cur.path)) setPicked(null);
      setDoc(d);
    },
    [variant, describe],
  );

  const sendWithSelection = useCallback(
    (message: string) => {
      const sel = pickedRef.current;
      send(sel ? withContext(message, sel.context) : message);
      setPicked(null);
    },
    [send],
  );

  const selectBigger = () => {
    const parent = selectedEl?.parentElement;
    if (!parent || parent === root) return;
    const named = variant === "B" ? nearestNamed(parent, root) : sectionOf(parent, root);
    if (named) setPicked(describe(named));
  };
  const canGoBigger = !!selectedEl && selectedEl.parentElement !== root && !!root;

  if (!variant) return { onWorkingDocument: undefined, instrument: undefined, send, composerAddon: null, overlay: null };

  const parts = variant === "C" && selectedEl && sectionOf(selectedEl, root) === selectedEl ? namedParts(selectedEl) : [];
  const hint: Record<Variant, string> = {
    A: "Tip: click a section of the working slip, then click inside it to pick a smaller part.",
    B: "Tip: click any part of the working slip; Select bigger widens it.",
    C: "Tip: click a section of the working slip, then narrow it with the part buttons.",
  };

  const composerAddon: ReactNode = (
    <div className="proto-chip-row">
      {picked ? (
        <>
          <span className="proto-chip">
            📍 About: <strong>{picked.label}</strong>
            {canGoBigger && (
              <button type="button" className="proto-bigger" onClick={selectBigger}>
                Select bigger
              </button>
            )}
            <button type="button" aria-label="Clear selection" onClick={() => setPicked(null)}>
              ×
            </button>
          </span>
          {parts.length > 0 && (
            <div className="proto-parts">
              {parts.map((p) => (
                <button
                  key={classesOf(p)[0]}
                  type="button"
                  onMouseEnter={() => p.setAttribute("data-proto-hover", "")}
                  onMouseLeave={() => p.removeAttribute("data-proto-hover")}
                  onClick={() => {
                    p.removeAttribute("data-proto-hover");
                    setPicked(describe(p));
                  }}
                >
                  {labelFor(p)}
                </button>
              ))}
            </div>
          )}
          <div className="proto-context">
            Flint also gets: <code>{picked.context}</code>
          </div>
        </>
      ) : (
        <span className="proto-hint">{hint[variant]}</span>
      )}
    </div>
  );

  const overlay = createPortal(
    <div className="proto-switcher" role="toolbar" aria-label="Prototype variant">
      <button type="button" onClick={() => choose(VARIANTS[(VARIANTS.indexOf(variant) + 2) % 3]!)}>
        ←
      </button>
      <span>
        PROTOTYPE {variant} ({NAMES[variant]})
      </span>
      <button type="button" onClick={() => choose(VARIANTS[(VARIANTS.indexOf(variant) + 1) % 3]!)}>
        →
      </button>
    </div>,
    document.body,
  );

  return { onWorkingDocument, instrument: instrumentSource, send: sendWithSelection, composerAddon, overlay };
}
