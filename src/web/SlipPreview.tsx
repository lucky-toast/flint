import { useLayoutEffect, useRef, useState, type SyntheticEvent } from "react";
import { PAPER_SIZES, PREVIEW_SANDBOX, previewDocument, type Paper } from "../core";

type Props = {
  html: string;
  paper: Paper;
  title?: string;
  /** Told about each freshly loaded slip document (same-origin), e.g. to listen for pointing at parts. */
  onDocument?: (doc: Document) => void;
  /** Bumped to make the sheet glow for a moment; 0 for none. */
  glow?: number;
};

/** How far a small sheet is enlarged at most; past that it's centred at this size. */
const MAX_SCALE = 1.5;

const PX_PER_UNIT: Record<string, number> = { in: 96, mm: 96 / 25.4 };

function toPx(length: string): number {
  const match = /^([\d.]+)(in|mm)$/.exec(length);
  if (!match) throw new Error(`Unsupported paper length ${length}`);
  return Number(match[1]) * PX_PER_UNIT[match[2]!]!;
}

/**
 * The frame is same-origin (so the app can print it), which lets the app cancel link clicks inside
 * it: a link planted by a hijacked edit (say, carrying order data in its URL) goes nowhere.
 */
function blockLinks(event: SyntheticEvent<HTMLIFrameElement>) {
  const doc = event.currentTarget.contentDocument;
  doc?.addEventListener(
    "click",
    (e) => {
      if ((e.target as Element | null)?.closest?.("a, area")) e.preventDefault();
    },
    true,
  );
}

/**
 * Shows rendered slip HTML in a sandboxed iframe (scripts disabled) whose document carries the
 * preview CSP, so template content can't run code or load anything from other sites. Link clicks
 * inside it are cancelled, so it can't navigate away either.
 * The frame is laid out at the paper's real size and scaled to its container's width: down for a
 * Letter sheet, up (to MAX_SCALE) for a small 4×6 label so it doesn't float in empty space.
 */
export function SlipPreview({ html, paper, title = "Slip preview", onDocument, glow = 0 }: Props) {
  const size = PAPER_SIZES[paper];
  const width = toPx(size.width);
  const height = toPx(size.height);
  const box = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(width);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setBoxWidth(el.clientWidth);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [width]);

  const scale = Math.min(MAX_SCALE, boxWidth / width);
  // Left offset that centres the sheet when it's capped narrower than the box.
  const left = Math.max(0, (boxWidth - width * scale) / 2);

  return (
    <div ref={box} className="slip-preview-box" style={{ height: height * scale }}>
      {glow > 0 && (
        <div
          key={glow}
          className="slip-glow"
          aria-hidden="true"
          style={{ width: width * scale, height: height * scale, left }}
        />
      )}
      <iframe
        className="slip-preview"
        title={title}
        data-paper={paper}
        sandbox={PREVIEW_SANDBOX}
        srcDoc={previewDocument(html, paper)}
        onLoad={(e) => {
          blockLinks(e);
          const doc = e.currentTarget.contentDocument;
          if (doc && onDocument) onDocument(doc);
        }}
        style={{ width: size.width, height: size.height, transform: `translateX(${left}px) scale(${scale})` }}
      />
    </div>
  );
}
