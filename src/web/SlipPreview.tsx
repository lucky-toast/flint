import { PAPER_SIZES, PREVIEW_SANDBOX, previewDocument, type Paper } from "../core";

type Props = { html: string; paper: Paper };

/**
 * Shows rendered slip HTML in a sandboxed iframe (scripts disabled) whose document carries the
 * preview CSP, so template content can't run code or load anything from other sites.
 */
export function SlipPreview({ html, paper }: Props) {
  const size = PAPER_SIZES[paper];
  return (
    <iframe
      className="slip-preview"
      title="Slip preview"
      sandbox={PREVIEW_SANDBOX}
      srcDoc={previewDocument(html, paper)}
      style={{ width: size.width, height: size.height }}
    />
  );
}
