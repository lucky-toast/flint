import { useLayoutEffect, useRef, useState } from "react";
import { PAPER_SIZES, PREVIEW_SANDBOX, previewDocument, type Paper } from "../core";

type Props = { html: string; paper: Paper; title?: string };

const PX_PER_UNIT: Record<string, number> = { in: 96, mm: 96 / 25.4 };

function toPx(length: string): number {
  const match = /^([\d.]+)(in|mm)$/.exec(length);
  if (!match) throw new Error(`Unsupported paper length ${length}`);
  return Number(match[1]) * PX_PER_UNIT[match[2]!]!;
}

/**
 * Shows rendered slip HTML in a sandboxed iframe (scripts disabled) whose document carries the
 * preview CSP, so template content can't run code or load anything from other sites.
 * The frame is laid out at the paper's real size and scaled down to fit its container.
 */
export function SlipPreview({ html, paper, title = "Slip preview" }: Props) {
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
      <iframe
        className="slip-preview"
        title={title}
        data-paper={paper}
        sandbox={PREVIEW_SANDBOX}
        srcDoc={previewDocument(html, paper)}
        style={{ width: size.width, height: size.height, transform: `scale(${scale})` }}
      />
    </div>
  );
}
