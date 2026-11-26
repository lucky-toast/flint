// PROTOTYPE (issue #20), throwaway: never merge into main.
// Question: how should "point at part of the slip instead of describing it" behave, both in what
// the seller can select and in what Flint is told about the selection?
// Three variants on the real editor's working slip, switchable with ?variant=A|B|C (no param: off).
//
//   A  Precise pick    Select: exactly the element under the cursor (a cell, a word's <span>, the
//                      logo); "Select bigger" on the chip widens it to its parent.
//                      Flint gets: the rendered HTML of the selection (what's on the slip).
//   B  Named parts     Select: only whole top-level parts (header, ship-to, items table, totals,
//                      thank-you), with a name tag on hover.
//                      Flint gets: where the part is in the template source (line range + first line).
//   C  Point and ask   Select: the nearest element with a class; clicking opens a box right on the
//                      slip with quick actions and a text field that send straight away.
//                      Flint gets: a plain-English name and the class ("the Order number part,
//                      class order-number").
//
// In every variant the selection is appended to the seller's message as one line, and the UI shows
// exactly that line ("Flint also gets…") so the variants can be compared on what Flint sees.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MAX_MESSAGE_LENGTH } from "../../core";

export type Variant = "A" | "B" | "C";
const VARIANTS: Variant[] = ["A", "B", "C"];
const NAMES: Record<Variant, string> = { A: "Precise pick", B: "Named parts", C: "Point and ask" };

type Picked = { label: string; path: number[]; context: string };

const ACCENT = "#e8590c";
const FRAME_STYLE = `
[data-proto-hover] { outline: 2px dashed ${ACCENT} !important; outline-offset: 2px; cursor: pointer; }
[data-proto-selected] { outline: 2px solid ${ACCENT} !important; outline-offset: 2px; background-color: rgb(232 89 12 / 0.07) !important; }
.proto-tag { position: absolute; z-index: 9999; background: ${ACCENT}; color: #fff; font: 600 13px/1 system-ui, sans-serif;
  padding: 5px 8px; border-radius: 4px 4px 0 0; pointer-events: none; white-space: nowrap; }
`;

const TAG_NAMES: Record<string, string> = {
  img: "Image", table: "Table", tr: "Table row", td: "Table cell", th: "Column heading", h1: "Heading",
  h2: "Heading", h3: "Heading", p: "Text", header: "Header", footer: "Footer", section: "Section",
  div: "Block", span: "Text", strong: "Bold text", em: "Italic text", br: "Line break",
};

/** Message plus selection line, kept under the message cap (the message gives way). */
function withContext(message: string, context: string): string {
  return `${message.slice(0, MAX_MESSAGE_LENGTH - context.length - 1)}\n${context}`;
}

function readVariant(): Variant | null {
  const v = new URLSearchParams(location.search).get("variant");
  return VARIANTS.includes(v as Variant) ? (v as Variant) : null;
}

function humanize(cls: string): string {
  const words = cls.replace(/^(col|slip)-/, "").replace(/[-_]+/g, " ").trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : cls;
}

function classesOf(el: Element): string[] {
  return [...el.classList].filter((c) => !c.startsWith("proto"));
}

function labelFor(el: Element): string {
  const cls = classesOf(el)[0];
  if (cls) {
    const name = humanize(cls);
    return el.tagName === "TD" || el.tagName === "TH" ? `${name} column` : name;
  }
  return TAG_NAMES[el.tagName.toLowerCase()] ?? el.tagName.toLowerCase();
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

/** The slip's root: the first element in <body> that isn't a <style>. */
function slipRoot(doc: Document): Element | null {
  return [...doc.body.children].find((c) => c.tagName !== "STYLE" && !c.classList.contains("proto-tag")) ?? null;
}

// ---- What can be selected ----

/** A: the element itself, unless it's the slip root or body. */
function exactElement(el: Element, root: Element | null): Element | null {
  return el === root || el.tagName === "BODY" || el.tagName === "HTML" ? null : el;
}

/** B: the top-level part of the slip that holds the element. */
function topLevelPart(el: Element, root: Element | null): Element | null {
  let node: Element | null = el;
  while (node && node.parentElement && node.parentElement !== root) {
    if (node.tagName === "BODY") return null;
    node = node.parentElement;
  }
  return node && node !== root && node.tagName !== "BODY" ? node : null;
}

/** C: the nearest element with a class, below the slip root. */
function nearestClassed(el: Element, root: Element | null): Element | null {
  let node: Element | null = el;
  while (node && node !== root && node.tagName !== "BODY") {
    if (classesOf(node).length) return node;
    node = node.parentElement;
  }
  return null;
}

// ---- What Flint is told ----

function openingTag(el: Element): string {
  const cls = classesOf(el).join(" ");
  return `<${el.tagName.toLowerCase()}${cls ? ` class="${cls}"` : ""}>`;
}

/** A: the rendered HTML, whitespace collapsed, cut to fit. */
function renderedHtmlContext(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  for (const e of [clone, ...clone.querySelectorAll("*")]) {
    e.removeAttribute("data-proto-hover");
    e.removeAttribute("data-proto-selected");
    // Data-URL images would eat the whole budget.
    const src = e.getAttribute("src");
    if (src?.startsWith("data:")) e.setAttribute("src", "data:…");
  }
  let html = clone.outerHTML.replace(/\s+/g, " ").trim();
  if (html.length > 220) html = `${html.slice(0, 220)}…`;
  return `(The seller selected this rendered HTML on the slip: ${html})`;
}

/** B: where the part sits in the template source, found by its first class. */
function sourceLocationContext(el: Element, source: string): string {
  const cls = classesOf(el)[0];
  const lines = source.split("\n");
  const start = cls ? lines.findIndex((l) => new RegExp(`class="[^"]*\\b${cls}\\b`).test(l) && !/^\s*\./.test(l)) : -1;
  if (start < 0) return `(The seller selected the part of the slip that starts with ${openingTag(el)})`;
  const indent = /^\s*/.exec(lines[start]!)![0];
  let end = start;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i]!.startsWith(`${indent}</`)) {
      end = i;
      break;
    }
  }
  const first = lines[start]!.trim().slice(0, 120);
  return `(The seller selected template lines ${start + 1}-${end + 1}, starting: ${first})`;
}

/** C: a plain-English name plus the class. */
function nameContext(el: Element): string {
  const cls = classesOf(el)[0];
  return `(This is about the "${labelFor(el)}" part of the slip${cls ? `, class ${cls}` : ""}.)`;
}

function clearMark(doc: Document, attr: string) {
  doc.querySelectorAll(`[${attr}]`).forEach((e) => e.removeAttribute(attr));
}

type Popover = { x: number; y: number; picked: Picked };

export function useHoverSelectPrototype(send: (message: string) => void, source: string) {
  const [variant, setVariant] = useState<Variant | null>(readVariant);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [popover, setPopover] = useState<Popover | null>(null);
  const docRef = useRef<Document | null>(null);
  const pickedRef = useRef(picked);
  pickedRef.current = picked;
  const sourceRef = useRef(source);
  sourceRef.current = source;

  const choose = useCallback((v: Variant) => {
    const url = new URL(location.href);
    url.searchParams.set("variant", v);
    history.replaceState(null, "", url);
    setVariant(v);
    setPicked(null);
    setPopover(null);
    if (docRef.current) {
      clearMark(docRef.current, "data-proto-selected");
      clearMark(docRef.current, "data-proto-hover");
    }
  }, []);

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

  // Re-mark the selection whenever it changes.
  useEffect(() => {
    const doc = docRef.current;
    if (!doc) return;
    clearMark(doc, "data-proto-selected");
    if (picked) atPath(doc, picked.path)?.setAttribute("data-proto-selected", "");
  }, [picked]);

  const describe = useCallback(
    (el: Element): Picked => {
      const context =
        variant === "A" ? renderedHtmlContext(el) : variant === "B" ? sourceLocationContext(el, sourceRef.current) : nameContext(el);
      return { label: labelFor(el), path: pathOf(el), context };
    },
    [variant],
  );

  const onWorkingDocument = useCallback(
    (doc: Document, frame: HTMLIFrameElement) => {
      if (!variant) return;
      docRef.current = doc;
      const style = doc.createElement("style");
      style.textContent = FRAME_STYLE;
      doc.head.appendChild(style);
      const tag = doc.createElement("div");
      tag.className = "proto-tag";
      tag.hidden = true;
      doc.body.appendChild(tag);
      const root = slipRoot(doc);
      const target = (el: Element) =>
        variant === "A" ? exactElement(el, root) : variant === "B" ? topLevelPart(el, root) : nearestClassed(el, root);

      // A fresh document (after an edit or order switch): find the selection again, or drop it.
      if (pickedRef.current) {
        const again = atPath(doc, pickedRef.current.path);
        if (again) again.setAttribute("data-proto-selected", "");
        else setPicked(null);
      }

      doc.addEventListener("mouseover", (e) => {
        clearMark(doc, "data-proto-hover");
        const el = target(e.target as Element);
        tag.hidden = true;
        if (!el) return;
        el.setAttribute("data-proto-hover", "");
        const r = el.getBoundingClientRect();
        tag.textContent = labelFor(el);
        tag.style.left = `${r.left + doc.defaultView!.scrollX - 2}px`;
        tag.style.top = `${r.top + doc.defaultView!.scrollY - 24}px`;
        tag.hidden = false;
      });
      doc.addEventListener("mouseleave", () => {
        clearMark(doc, "data-proto-hover");
        tag.hidden = true;
      });
      doc.addEventListener("click", (e) => {
        const el = target(e.target as Element);
        if (!el) {
          setPicked(null);
          setPopover(null);
          return;
        }
        const next = describe(el);
        if (variant === "C") {
          setPicked(next);
          const frameRect = frame.getBoundingClientRect();
          const scale = frameRect.width / frame.offsetWidth;
          const r = el.getBoundingClientRect();
          setPopover({ x: frameRect.left + r.left * scale, y: frameRect.top + r.bottom * scale + 6, picked: next });
        } else {
          setPicked((cur) => (cur && cur.path.join() === next.path.join() ? null : next));
        }
      });
    },
    [variant, describe],
  );

  // Variant C's popover is anchored to the page; scrolling moves the slip, so close it.
  useEffect(() => {
    if (!popover) return;
    const close = () => {
      setPopover(null);
      setPicked(null);
    };
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [popover]);

  const sendWithSelection = useCallback(
    (message: string) => {
      const sel = pickedRef.current;
      send(sel && variant !== "C" ? withContext(message, sel.context) : message);
      setPicked(null);
    },
    [send, variant],
  );

  /** A: widen the selection to its parent. */
  const selectBigger = useCallback(() => {
    const doc = docRef.current;
    const cur = pickedRef.current;
    if (!doc || !cur) return;
    const el = atPath(doc, cur.path)?.parentElement;
    const root = slipRoot(doc);
    if (el && el !== root && el.tagName !== "BODY") setPicked(describe(el));
  }, [describe]);

  if (!variant) return { onWorkingDocument: undefined, send, composerAddon: null, overlay: null };

  const composerAddon: ReactNode =
    variant !== "C" ? (
      <div className="proto-chip-row">
        {picked ? (
          <>
            <span className="proto-chip">
              📍 About: <strong>{picked.label}</strong>
              {variant === "A" && (
                <button type="button" className="proto-bigger" onClick={selectBigger}>
                  Select bigger
                </button>
              )}
              <button type="button" aria-label="Clear selection" onClick={() => setPicked(null)}>
                ×
              </button>
            </span>
            <div className="proto-context">
              Flint also gets: <code>{picked.context}</code>
            </div>
          </>
        ) : (
          <span className="proto-hint">
            {variant === "A"
              ? "Tip: click anything on the working slip to talk about exactly that."
              : "Tip: click a section of the working slip to talk about just that section."}
          </span>
        )}
      </div>
    ) : null;

  const overlay = createPortal(
    <>
      {popover && (
        <PointAndAsk
          popover={popover}
          onSend={(text) => {
            send(withContext(text, popover.picked.context));
            setPopover(null);
            setPicked(null);
          }}
          onClose={() => {
            setPopover(null);
            setPicked(null);
          }}
        />
      )}
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
      </div>
    </>,
    document.body,
  );

  return { onWorkingDocument, send: sendWithSelection, composerAddon, overlay };
}

const QUICK = ["Make it bigger", "Make it bold", "Hide it", "Move it to the bottom"];

function PointAndAsk({ popover, onSend, onClose }: { popover: Popover; onSend: (t: string) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const { label, context } = popover.picked;
  return (
    <div className="proto-popover" style={{ left: popover.x, top: popover.y }}>
      <div className="proto-popover-head">
        <strong>{label}</strong>
        <button type="button" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="proto-popover-chips">
        {QUICK.map((q) => (
          <button key={q} type="button" onClick={() => onSend(q)}>
            {q}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) onSend(text.trim());
        }}
      >
        <input autoFocus value={text} placeholder={`Change the ${label.toLowerCase()}…`} onChange={(e) => setText(e.target.value)} />
      </form>
      <div className="proto-context">
        Flint also gets: <code>{context}</code>
      </div>
    </div>
  );
}
