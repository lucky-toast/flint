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
   * Pointing at parts (the working slip only). When given, the pane renders the preview-only copy
   * of the template whose tags carry where they are in the source, and hands each loaded slip
   * document to `onDocument`. Without it, the slip renders as it is and nothing listens to it.
   */
  pointing?: { onDocument: (doc: Document) => void };
};

/** One editor pane: a heading and the slip rendered for the chosen example order. */
export function SlipPane({ label, source, shop, order, paper, assets, children, footer, pointing }: Props) {
  const rendered = useRenderedSlip(source, shop, order, assets, { instrument: pointing !== undefined });
  return (
    <section className="slip-pane" aria-label={`${label} slip`}>
      <h2>{label}</h2>
      {children}
      {rendered.status === "ok" && <SlipPreview title={`${label} slip`} html={rendered.html} paper={paper} onDocument={pointing?.onDocument} />}
      {rendered.status === "rendering" && <p className="slip-status">Rendering…</p>}
      {rendered.status === "error" && (
        <p className="slip-status" role="alert">
          This slip couldn't be rendered: {rendered.message}
        </p>
      )}
      {footer}
    </section>
  );
}
