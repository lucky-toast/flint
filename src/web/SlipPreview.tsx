import { useLayoutEffect, useRef, useState, type SyntheticEvent, type UIEvent } from "react";
import { PAPER_SIZES, PREVIEW_SANDBOX, previewDocument, type Paper } from "../core";

type Props = {
  html: string;
  paper: Paper;
  title?: string;
  /** Told about each freshly loaded slip document (same-origin), e.g. to listen for pointing at parts. */
  onDocument?: (doc: Document) => void;
  /** Bumped to make the sheet glow for a moment; 0 for none. */
  glow?: number;
  /** Show the sheet on a dark desk sized for the largest paper, so its real size reads at a glance. */
  desk?: boolean;
  /** On the desk: how far past the fitted size the sheet is shown (one of ZOOM_STEPS). */
  zoom?: number;
  /** On the desk: shows the zoom buttons and is told the new zoom. */
  onZoom?: (zoom: number) => void;
};

/** Zoom levels on the desk, as multiples of the fitted size. */
export const ZOOM_STEPS = [1, 1.5, 2, 3];

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

/** The desk fits the largest paper (Letter's width, A4's height), so every sheet shares one scale. */
const DESK_PAPER = { width: toPx(PAPER_SIZES.letter.width), height: toPx(PAPER_SIZES.a4.height) };
const DESK_PADDING = 20;
const PAPER_CAPTIONS: Record<Paper, string> = { letter: "Letter · 8.5 × 11 in", a4: "A4 · 210 × 297 mm", "4x6": "4 × 6 in label" };

/**
 * Shows rendered slip HTML in a sandboxed iframe (scripts disabled) whose document carries the
 * preview CSP, so template content can't run code or load anything from other sites. Link clicks
 * inside it are cancelled, so it can't navigate away either.
 * The frame is laid out at the paper's real size and scaled down (never up) to fit its container.
 */
/** Zoomed desks scroll together, so the same spot of both slips stays in view. */
function followScroll(event: UIEvent<HTMLDivElement>) {
  const from = event.currentTarget;
  for (const other of document.querySelectorAll<HTMLDivElement>(".slip-desk-scroll")) {
    if (other === from) continue;
    if (other.scrollLeft !== from.scrollLeft) other.scrollLeft = from.scrollLeft;
    if (other.scrollTop !== from.scrollTop) other.scrollTop = from.scrollTop;
  }
}

export function SlipPreview({ html, paper, title = "Slip preview", onDocument, glow = 0, desk = false, zoom = 1, onZoom }: Props) {
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
  }, []);

  // On the desk, every paper uses the scale that fits the largest one, so a 4×6 label looks as much
  // smaller than a Letter sheet as it really is; zoom multiplies it and the desk scrolls. Without the
  // desk, the sheet fills the width.
  const fitScale = desk
    ? Math.min(1, (boxWidth - 2 * DESK_PADDING) / DESK_PAPER.width)
    : Math.min(1, boxWidth / width);
  const scale = desk ? fitScale * zoom : fitScale;
  const boxHeight = desk ? DESK_PAPER.height * fitScale + 2 * DESK_PADDING : height * scale;
  // Every sheet sits at the desk's top-left corner, where a Letter sheet would, so the padding is even
  // and a smaller sheet's size shows against the space it leaves.
  const left = desk ? Math.max(DESK_PADDING, (boxWidth - DESK_PAPER.width * fitScale) / 2) : 0;
  const top = desk ? DESK_PADDING : 0;

  const sheet = (
    <>
      {glow > 0 && (
        <div
          key={glow}
          className="slip-glow"
          aria-hidden="true"
          style={{ width: width * scale, height: height * scale, left, top }}
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
        style={{ width: size.width, height: size.height, transform: `translate(${left}px, ${top}px) scale(${scale})` }}
      />
    </>
  );

  if (!desk) {
    return (
      <div ref={box} className="slip-preview-box" style={{ height: boxHeight }}>
        {sheet}
      </div>
    );
  }

  const zoomIndex = ZOOM_STEPS.indexOf(zoom);
  return (
    <div ref={box} className="slip-preview-box slip-desk" style={{ height: boxHeight }}>
      <div className="slip-desk-scroll" onScroll={followScroll}>
        {/* Sized to the zoomed sheet plus padding, so the desk scrolls to every edge of it. */}
        <div
          className="slip-desk-sizer"
          style={{ width: Math.max(boxWidth, left + width * scale + DESK_PADDING), height: Math.max(boxHeight, top + height * scale + DESK_PADDING) }}
        >
          {sheet}
        </div>
      </div>
      {onZoom && (
        <div className="slip-zoom" role="group" aria-label={`Zoom ${title}`}>
          <button type="button" aria-label="Zoom out" title="Zoom out" disabled={zoomIndex <= 0} onClick={() => onZoom(ZOOM_STEPS[zoomIndex - 1]!)}>
            −
          </button>
          <button type="button" className="slip-zoom-level" title="Fit to the desk" onClick={() => onZoom(1)}>
            {Math.round(scale * 100)}%
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            title="Zoom in"
            disabled={zoomIndex >= ZOOM_STEPS.length - 1}
            onClick={() => onZoom(ZOOM_STEPS[zoomIndex + 1]!)}
          >
            +
          </button>
        </div>
      )}
      <span className="slip-desk-caption" aria-hidden="true">
        {PAPER_CAPTIONS[paper]}
      </span>
    </div>
  );
}
