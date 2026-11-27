import type { ReactNode } from "react";
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
};

/** One editor pane: a heading and the slip rendered for the chosen example order. */
export function SlipPane({ label, source, shop, order, paper, assets, children, footer, onDocument }: Props) {
  const rendered = useRenderedSlip(source, shop, order, assets, { instrument: !!onDocument });
  return (
    <section className="slip-pane" aria-label={`${label} slip`}>
      <h2>{label}</h2>
      {/* Every pane has the same four rows (lined up across panes), so notes never push one slip below the other. */}
      <div className="slip-pane-notes">{children}</div>
      <div className="slip-pane-slip">
        {rendered.status === "ok" && <SlipPreview title={`${label} slip`} html={rendered.html} paper={paper} onDocument={onDocument} />}
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
