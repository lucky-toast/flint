// The cases to count: every source file × every size × every detail setting,
// plus a text-only baseline so each media cost can be read off as a difference.
//
// A case is a small descriptor plus an async build() that prepares its media
// on demand, so only one full-size payload is in memory at a time.

import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  dataUrl,
  imageInfo,
  openPdf,
  pdfFullLongEdge,
  pdfText,
  renderPdfPage,
  resizeImage,
} from "./media.mjs";

/** The four source files. `kind` picks how they're sent; `files` are tried in order. */
export const SOURCES = [
  { id: "pdf-text", kind: "pdf", files: ["pdf-text.pdf"], sendTextLayer: true },
  { id: "pdf-flat", kind: "pdf", files: ["pdf-flat.pdf"], sendTextLayer: false },
  { id: "design", kind: "image", files: ["design.png"] },
  { id: "sketch", kind: "image", files: ["sketch.jpg", "sketch.jpeg", "sketch.png"] },
];

const textPart = (text) => ({ type: "input_text", text });
const imagePart = (img, detail) => ({ type: "input_image", image_url: dataUrl(img.mime, img.bytes), detail });

/** Sizes from the ladder that apply to a source whose full long edge is `nativeLongEdge`. */
function ladderFor(sizes, nativeLongEdge) {
  return sizes.filter((s) => s === "full" || s < nativeLongEdge);
}

/**
 * Builds the case list. Returns { cases, sources, warnings }.
 * Each case: { id, source, variant, size, detail, build: async () => ({ content, media }) }
 *   content: the user message's content parts
 *   media:   what was sent, for the report (dims, bytes, pages, text chars)
 */
export async function buildCases(CONFIG) {
  const cases = [];
  const sources = [];
  const warnings = [];
  const prompt = textPart(CONFIG.prompt);

  cases.push({
    id: "baseline",
    source: "baseline",
    variant: "prompt-only",
    size: "-",
    detail: "-",
    build: async () => ({ content: [prompt], media: {} }),
  });

  for (const src of SOURCES) {
    if (CONFIG.only && !CONFIG.only.includes(src.id)) continue;
    const file = src.files.map((f) => join(CONFIG.inputsDir, f)).find(existsSync);
    if (!file) {
      warnings.push(`${src.id}: no input found (looked for ${src.files.join(", ")} in ${CONFIG.inputsDir}); skipped`);
      continue;
    }
    const buf = readFileSync(file);

    if (src.kind === "image") {
      const info = await imageInfo(buf);
      sources.push({ id: src.id, file: basename(file), ...info, bytes: buf.length });
      for (const size of ladderFor(CONFIG.sizes, info.longEdge)) {
        for (const detail of CONFIG.imageDetails) {
          cases.push({
            id: `${src.id}/image/${size}/${detail}`,
            source: src.id,
            variant: "image",
            size,
            detail,
            build: async () => {
              const img = await resizeImage(buf, info, size, CONFIG);
              return {
                content: [imagePart(img, detail), prompt],
                media: { width: img.width, height: img.height, bytes: img.bytes.length, mime: img.mime, images: 1 },
                files: [{ name: `${src.id}-${size}.${img.mime.split("/")[1]}`, bytes: img.bytes }],
              };
            },
          });
        }
      }
      continue;
    }

    // ---- PDF ----
    const pdf = openPdf(buf, { maxPages: CONFIG.maxPdfPages });
    const fullLong = pdfFullLongEdge(pdf, CONFIG.pdfDpi);
    sources.push({
      id: src.id,
      file: basename(file),
      pages: pdf.totalPages,
      pagesUsed: pdf.pages.length,
      textChars: pdf.textChars,
      longEdgeAtFullDpi: fullLong,
      bytes: buf.length,
    });
    if (pdf.totalPages > pdf.pages.length) {
      warnings.push(`${src.id}: ${pdf.totalPages} pages; only the first ${pdf.pages.length} are rendered`);
    }
    if (src.sendTextLayer && !pdf.hasText) {
      warnings.push(`${src.id}: expected a text layer but found none; raster+text cases will match raster`);
    }
    if (!src.sendTextLayer && pdf.hasText) {
      warnings.push(`${src.id}: expected no text layer but found ${pdf.textChars} chars (the server may still extract it in "file" cases)`);
    }

    // 1. The PDF itself, as Muse would receive an upload: the server extracts
    //    text and rasterizes pages on its side.
    for (const detail of CONFIG.fileDetails) {
      cases.push({
        id: `${src.id}/file/-/${detail}`,
        source: src.id,
        variant: "file",
        size: "-",
        detail,
        build: async () => ({
          content: [
            { type: "input_file", filename: basename(file), file_data: dataUrl("application/pdf", buf), detail },
            prompt,
          ],
          media: { bytes: buf.length, mime: "application/pdf", pages: pdf.pages.length },
        }),
      });
    }

    // 2. Pages rendered by us at each size and sent as images; for the PDF
    //    with selectable text, also with its text layer alongside.
    const pageVariants = src.sendTextLayer ? ["raster", "raster+text"] : ["raster"];
    const text = pdfText(pdf);
    for (const size of ladderFor(CONFIG.sizes, fullLong)) {
      for (const detail of CONFIG.imageDetails) {
        for (const variant of pageVariants) {
          cases.push({
            id: `${src.id}/${variant}/${size}/${detail}`,
            source: src.id,
            variant,
            size,
            detail,
            build: async () => {
              const imgs = pdf.pages.map((p) => renderPdfPage(p, size, { fullDpi: CONFIG.pdfDpi }));
              const parts = imgs.map((img) => imagePart(img, detail));
              if (variant === "raster+text") parts.push(textPart(`Text layer of the PDF:\n\n${text}`));
              parts.push(prompt);
              return {
                content: parts,
                media: {
                  width: imgs[0].width,
                  height: imgs[0].height,
                  bytes: imgs.reduce((n, i) => n + i.bytes.length, 0),
                  mime: "image/png",
                  images: imgs.length,
                  textChars: variant === "raster+text" ? text.length : 0,
                },
                files: imgs.map((img, i) => ({ name: `${src.id}-${size}-p${i + 1}.png`, bytes: img.bytes })),
              };
            },
          });
        }
      }
    }

    // 3. The text layer alone, to separate its cost from the page images.
    if (src.sendTextLayer && pdf.hasText) {
      cases.push({
        id: `${src.id}/text-only/-/-`,
        source: src.id,
        variant: "text-only",
        size: "-",
        detail: "-",
        build: async () => ({
          content: [textPart(`Text layer of the PDF:\n\n${text}`), prompt],
          media: { textChars: text.length },
        }),
      });
    }
  }

  return { cases, sources, warnings };
}
