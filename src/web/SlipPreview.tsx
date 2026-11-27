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
 * The frame is laid out at the paper's real size and scaled down to fit its container.
 */
export function SlipPreview({ html, paper, title = "Slip preview", onDocument, glow = 0 }: Props) {
  const size = PAPER_SIZES[paper];
  const width = toPx(size.width);
  const height = toPx(size.height);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / width));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [width]);

  return (
    <div ref={box} className="slip-preview-box" style={{ height: height * scale }}>
      {glow > 0 && (
        <div
          key={glow}
          className="slip-glow"
          aria-hidden="true"
          style={{ width: width * scale, height: height * scale, left: scale === 1 ? `calc(50% - ${width / 2}px)` : 0 }}
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
        // Centred when the paper fits at full size (a 4×6 label in a wide pane); scaled from the left edge otherwise.
        style={{ width: size.width, height: size.height, transform: `scale(${scale})`, margin: scale === 1 ? "0 auto" : undefined }}
      />
    </div>
  );
}
