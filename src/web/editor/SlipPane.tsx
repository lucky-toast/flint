import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Order, Paper, Shop } from "../../core";
import { SlipPreview } from "../SlipPreview";
import { useRenderedSlip } from "./useRenderedSlip";

type Props = {
  /** "Original" or "Working"; also names the preview frame ("Original slip"). */
  label: string;
  source: string;
  shop: Shop;
  order: Order;
  paper: Paper;
  assets?: Record<string, string>;
  /** Extra content under the heading, e.g. what-changed notes or warnings. */
  children?: ReactNode;
  /** Content under the slip, e.g. the show-code toggle. */
  footer?: ReactNode;
  /**
   * For pointing at parts: render a preview-only copy of the template whose tags carry their
   * source lines, and hand each loaded slip document to this callback.
   */
  onDocument?: (doc: Document) => void;
  /** A small control beside the heading (e.g. hide or show the original). */
  action?: ReactNode;
  /** Zoom on the desk, shared by both panes so they stay comparable. */
  zoom?: number;
  onZoom?: (zoom: number) => void;
  /** Glow briefly whenever the source changes after the first render, so the eye goes to the new slip. */
  glowOnChange?: boolean;
};

/** One editor pane: a heading and the slip rendered for the chosen example order. */
export function SlipPane({ label, source, shop, order, paper, assets, children, footer, onDocument, glowOnChange, action, zoom, onZoom }: Props) {
  const rendered = useRenderedSlip(source, shop, order, assets, { instrument: !!onDocument });
  const glow = useChangeCount(source);
  return (
    <section className="slip-pane" aria-label={`${label} slip`}>
      <div className="slip-pane-head">
        <h2>{label}</h2>
        {action}
      </div>
      {/* Every pane has the same four rows (lined up across panes), so notes never push one slip below the other. */}
      <div className="slip-pane-notes">{children}</div>
      <div className="slip-pane-slip">
        {rendered.status === "ok" && <SlipPreview title={`${label} slip`} html={rendered.html} paper={paper} onDocument={onDocument} glow={glowOnChange ? glow : 0} desk zoom={zoom} onZoom={onZoom} />}
        {rendered.status === "rendering" && <p className="slip-status">Rendering…</p>}
        {rendered.status === "error" && (
          <p className="slip-status" role="alert">
            This slip couldn't be rendered: {rendered.message}
          </p>
        )}
      </div>
      <div className="slip-pane-footer">{footer}</div>
    </section>
  );
}

/** Counts how many times `value` has changed since the first render. */
function useChangeCount(value: string) {
  const first = useRef(value);
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (value !== first.current) {
      first.current = value;
      setCount((c) => c + 1);
    }
  }, [value]);
  return count;
}
