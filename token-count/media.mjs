// Media preparation: resizes images and turns PDFs into page images + text.
//
// Images go through sharp. PDFs go through MuPDF (WASM, no native build),
// which both renders pages and reads the text layer.

import * as mupdf from "mupdf";
import sharp from "sharp";

const MIME = { png: "image/png", jpeg: "image/jpeg", jpg: "image/jpeg", webp: "image/webp" };

export const dataUrl = (mime, buf) => `data:${mime};base64,${Buffer.from(buf).toString("base64")}`;

/**
 * Size of an image as displayed (EXIF orientation applied, so a portrait phone
 * photo reports portrait dimensions).
 */
export async function imageInfo(buf) {
  const meta = await sharp(buf).metadata();
  const rotated = (meta.orientation ?? 1) >= 5; // orientations 5-8 swap width and height
  const width = rotated ? meta.height : meta.width;
  const height = rotated ? meta.width : meta.height;
  const format = meta.format === "jpg" ? "jpeg" : meta.format;
  return { width, height, longEdge: Math.max(width, height), format, mime: MIME[format] ?? `image/${format}` };
}

/**
 * The image at `longEdge` px on its long side, in its own format.
 * `longEdge: "full"` returns the original bytes untouched.
 */
export async function resizeImage(buf, info, longEdge, { jpegQuality = 90 } = {}) {
  if (longEdge === "full") return { bytes: buf, width: info.width, height: info.height, mime: info.mime };
  let img = sharp(buf).rotate().resize(longEdge, longEdge, { fit: "inside", withoutEnlargement: true });
  img = info.format === "png" ? img.png({ compressionLevel: 9 }) : img.jpeg({ quality: jpegQuality, mozjpeg: true });
  const { data, info: out } = await img.toBuffer({ resolveWithObject: true });
  return { bytes: data, width: out.width, height: out.height, mime: info.format === "png" ? "image/png" : "image/jpeg" };
}

/**
 * The upload rule: the image at most `maxPixels` in total, keeping its shape, never enlarged.
 * An image already within the limit is returned as its original bytes.
 */
export async function fitToPixels(buf, info, maxPixels, opts = {}) {
  if (info.width * info.height <= maxPixels) return resizeImage(buf, info, "full", opts);
  const scale = Math.sqrt(maxPixels / (info.width * info.height));
  return resizeImage(buf, info, Math.floor(info.longEdge * scale), opts);
}

/** Opens a PDF and reports its pages (size in points) and whether it has a text layer. */
export function openPdf(buf, { maxPages = 50 } = {}) {
  const doc = mupdf.Document.openDocument(buf, "application/pdf");
  const total = doc.countPages();
  const pages = [];
  for (let i = 0; i < Math.min(total, maxPages); i++) {
    const page = doc.loadPage(i);
    const [x0, y0, x1, y1] = page.getBounds();
    const text = page.toStructuredText("preserve-whitespace").asText().trim();
    pages.push({ index: i, page, widthPt: x1 - x0, heightPt: y1 - y0, text });
  }
  const textChars = pages.reduce((n, p) => n + p.text.length, 0);
  return { doc, totalPages: total, pages, textChars, hasText: textChars > 0 };
}

/**
 * Renders one PDF page as a PNG. `longEdge: "full"` renders at `fullDpi`;
 * a number renders so the page's long side is that many pixels.
 */
export function renderPdfPage(p, longEdge, { fullDpi = 300 } = {}) {
  const longPt = Math.max(p.widthPt, p.heightPt);
  const scale = longEdge === "full" ? fullDpi / 72 : longEdge / longPt;
  const pix = p.page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
  return { bytes: Buffer.from(pix.asPNG()), width: pix.getWidth(), height: pix.getHeight(), mime: "image/png" };
}

/** The long edge, in px, of the PDF's largest page when rendered at `dpi`. */
export function pdfFullLongEdge(pdf, dpi) {
  return Math.round((Math.max(...pdf.pages.map((p) => Math.max(p.widthPt, p.heightPt))) * dpi) / 72);
}

/** The text layer of every page, labelled by page, as one string. */
export function pdfText(pdf) {
  return pdf.pages
    .filter((p) => p.text)
    .map((p) => `--- Page ${p.index + 1} ---\n${p.text}`)
    .join("\n\n");
}
