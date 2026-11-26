// PROTOTYPE (issue #20), throwaway: never merge into main.
// Question: what should "point at part of the slip instead of describing it" look like?
// Three variants on the real editor, switchable with ?variant=A|B|C (no param: prototype off).
//   A  Outline + chip:  hover outlines the nearest element with a class; click pins it as a chip
//                       above the message box, and the next message is about it.
//   B  Named parts:     hover highlights a whole top-level part of the slip (header, ship-to,
//                       items table, totals…) with a name tag; click pins it like A.
//   C  Point and ask:   click any element and a small box opens right on the slip, with quick
//                       actions and a text field; sending goes straight to Flint.
// In every variant the selection reaches Flint as a line appended to the message (see contextLine).

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MAX_MESSAGE_LENGTH } from "../../core";

/** Message plus selection line, kept under the message cap (the message gives way). */
function withContext(message: string, context: string): string {
  return `${message.slice(0, MAX_MESSAGE_LENGTH - context.length - 1)}
${context}`;
}

export type Variant = "A" | "B" | "C";
const VARIANTS: Variant[] = ["A", "B", "C"];
const NAMES: Record<Variant, string> = { A: "Outline + chip", B: "Named parts", C: "Point and ask" };

type Picked = { label: string; path: number[]; context: string };

const ACCENT = "#e8590c";
const FRAME_STYLE = `
[data-proto-hover] { outline: 2px dashed ${ACCENT} !important; outline-offset: 2px; cursor: pointer; }
[data-proto-selected] { outline: 2px solid ${ACCENT} !important; outline-offset: 2px; background-color: rgb(232 89 12 / 0.07) !important; }
.proto-tag { position: absolute; z-index: 9999; background: ${ACCENT}; color: #fff; font: 600 11px/1 system-ui, sans-serif;
  padding: 4px 7px; border-radius: 4px 4px 0 0; pointer-events: none; white-space: nowrap; }
`;

const TAG_NAMES: Record<string, string> = {
  img: "Image", table: "Table", tr: "Table row", td: "Table cell", th: "Column heading", h1: "Heading",
  h2: "Heading", h3: "Heading", p: "Text", header: "Header", footer: "Footer", section: "Section",
};

function readVariant(): Variant | null {
  const v = new URLSearchParams(location.search).get("variant");
  return VARIANTS.includes(v as Variant) ? (v as Variant) : null;
}

function humanize(cls: string): string {
  const words = cls.replace(/^(col|slip)-/, "").replace(/[-_]+/g, " ").trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : cls;
}

function labelFor(el: Element): string {
  const cls = [...el.classList].find((c) => !c.startsWith("proto"));
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

/** What Flint is told about the selection: the element's opening tag and a little of its text. */
function contextLine(el: Element): string {
  const cls = el.getAttribute("class")?.replace(/\s*proto-\S+/g, "");
  const tag = `<${el.tagName.toLowerCase()}${cls ? ` class="${cls}"` : ""}>`;
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  return `(The seller pointed at this part of the slip: ${tag}${text ? ` containing "${text}"` : ""})`;
}

/** The slip's root: the first element in <body> that isn't a <style>. */
function slipRoot(doc: Document): Element | null {
  return [...doc.body.children].find((c) => c.tagName !== "STYLE") ?? null;
}

/** Variant A/C target: the nearest element with a class, below the slip root. */
function nearestClassed(el: Element, root: Element | null): Element | null {
  let node: Element | null = el;
  while (node && node !== root && node.tagName !== "BODY") {
    if (node.classList.length) return node;
    node = node.parentElement;
  }
  return null;
}

/** Variant B target: the top-level part of the slip that holds the element. */
function topLevelPart(el: Element, root: Element | null): Element | null {
  let node: Element | null = el;
  while (node && node.parentElement && node.parentElement !== root) {
    if (node.tagName === "BODY") return null;
    node = node.parentElement;
  }
  return node && node !== root ? node : null;
}

function clearMark(doc: Document, attr: string) {
  doc.querySelectorAll(`[${attr}]`).forEach((e) => e.removeAttribute(attr));
}

type Popover = { x: number; y: number; label: string; context: string };

export function useHoverSelectPrototype(send: (message: string) => void, enabled: boolean) {
  const [variant, setVariant] = useState<Variant | null>(() => (enabled ? readVariant() : null));
  const [picked, setPicked] = useState<Picked | null>(null);
  const [popover, setPopover] = useState<Popover | null>(null);
  const docRef = useRef<Document | null>(null);
  const pickedRef = useRef(picked);
  pickedRef.current = picked;

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
      if (t.closest("input, textarea, [contenteditable]")) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const i = VARIANTS.indexOf(variant);
      choose(VARIANTS[(i + (e.key === "ArrowRight" ? 1 : VARIANTS.length - 1)) % VARIANTS.length]!);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant, choose]);

  // Re-mark the selection on a fresh slip document (each edit or order switch re-renders it).
  useEffect(() => {
    const doc = docRef.current;
    if (!doc) return;
    clearMark(doc, "data-proto-selected");
    if (picked) atPath(doc, picked.path)?.setAttribute("data-proto-selected", "");
  }, [picked]);

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
      const target = (el: Element) => (variant === "B" ? topLevelPart(el, root) : nearestClassed(el, root));

      if (pickedRef.current) atPath(doc, pickedRef.current.path)?.setAttribute("data-proto-selected", "");

      doc.addEventListener("mouseover", (e) => {
        clearMark(doc, "data-proto-hover");
        const el = target(e.target as Element);
        tag.hidden = true;
        if (!el) return;
        el.setAttribute("data-proto-hover", "");
        if (variant === "B" || variant === "A") {
          const r = el.getBoundingClientRect();
          tag.textContent = labelFor(el);
          tag.style.left = `${r.left + doc.defaultView!.scrollX - 2}px`;
          tag.style.top = `${r.top + doc.defaultView!.scrollY - 22}px`;
          tag.hidden = false;
        }
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
        const next: Picked = { label: labelFor(el), path: pathOf(el), context: contextLine(el) };
        setPicked((cur) => (variant !== "C" && cur && cur.path.join() === next.path.join() ? null : next));
        if (variant === "C") {
          const frameRect = frame.getBoundingClientRect();
          const scale = frameRect.width / frame.offsetWidth;
          const r = el.getBoundingClientRect();
          setPopover({
            x: frameRect.left + r.left * scale,
            y: frameRect.top + r.bottom * scale + 6,
            label: next.label,
            context: next.context,
          });
        }
      });
    },
    [variant],
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
      send(sel && variant !== "C" ? `${message}\n${sel.context}` : message);
      setPicked(null);
    },
    [send, variant],
  );

  if (!variant) return { active: false as const, onWorkingDocument: undefined, send, composerAddon: null, overlay: null };

  const composerAddon: ReactNode =
    variant !== "C" ? (
      <div className="proto-chip-row">
        {picked ? (
          <span className="proto-chip">
            📍 About: <strong>{picked.label}</strong>
            <button type="button" aria-label="Clear selection" onClick={() => setPicked(null)}>
              ×
            </button>
          </span>
        ) : (
          <span className="proto-hint">Tip: click part of the working slip to talk about just that part.</span>
        )}
      </div>
    ) : null;

  const overlay = createPortal(
    <>
      {popover && (
        <PointAndAsk
          popover={popover}
          onSend={(text) => {
            send(`${text}\n${popover.context}`);
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

  return { active: true as const, onWorkingDocument, send: sendWithSelection, composerAddon, overlay };
}

const QUICK = ["Make it bigger", "Make it bold", "Hide it", "Move it to the bottom"];

function PointAndAsk({ popover, onSend, onClose }: { popover: Popover; onSend: (t: string) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  return (
    <div className="proto-popover" style={{ left: popover.x, top: popover.y }}>
      <div className="proto-popover-head">
        <strong>{popover.label}</strong>
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
        <input autoFocus value={text} placeholder={`Change the ${popover.label.toLowerCase()}…`} onChange={(e) => setText(e.target.value)} />
      </form>
    </div>
  );
}
