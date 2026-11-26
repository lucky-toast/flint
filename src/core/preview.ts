import type { Paper } from "./schema";

/**
 * Content security policy for slip previews: only the document's own content and data URIs.
 * No scripts, no network connections, no objects or frames, no form submissions, no base URI.
 * Remote images or stylesheets are refused, so a hijacked edit can't carry order data elsewhere.
 */
export const PREVIEW_CSP = [
  "default-src 'none'",
  "img-src data:",
  "style-src 'unsafe-inline'",
  "font-src data:",
  "script-src 'none'",
  "connect-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "worker-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

/** Iframe sandbox tokens. Scripts stay disabled; same-origin and modals are kept so the app can print the frame. */
export const PREVIEW_SANDBOX = "allow-same-origin allow-modals";

export const PAPER_SIZES: Record<Paper, { width: string; height: string }> = {
  letter: { width: "8.5in", height: "11in" },
  a4: { width: "210mm", height: "297mm" },
  "4x6": { width: "4in", height: "6in" },
};

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Wraps rendered slip HTML in a full document carrying the preview CSP and the paper's page size. */
export function previewDocument(html: string, paper: Paper): string {
  const size = PAPER_SIZES[paper];
  return [
    "<!doctype html>",
    '<html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${escapeAttr(PREVIEW_CSP)}">`,
    `<style>@page { size: ${size.width} ${size.height}; margin: 0; } html, body { margin: 0; }</style>`,
    "</head><body>",
    html,
    "</body></html>",
  ].join("\n");
}
