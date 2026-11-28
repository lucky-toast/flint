#!/usr/bin/env node
// Makes the text-free PDF input: renders every page of inputs/pdf-text.pdf to an image and
// writes those images as a new PDF, inputs/pdf-flat.pdf. Same design and page size, no text
// layer, so the two PDF inputs differ only in the text.
//
//   node flatten-pdf.mjs              [--dpi=300] [--from=pdf-text.pdf] [--to=pdf-flat.pdf]
//
// An existing pdf-flat.pdf is kept as pdf-flat.before-flatten.pdf. The new file is reopened
// afterwards to check it really has no text.

import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import { openPdf, renderPdfPage } from "./media.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  }),
);
const dpi = Number.parseInt(args.dpi ?? "300", 10);
const inputs = join(HERE, "inputs");
const from = join(inputs, String(args.from ?? "pdf-text.pdf"));
const to = join(inputs, String(args.to ?? "pdf-flat.pdf"));

if (!existsSync(from)) {
  console.error(`Not found: ${from}`);
  process.exit(1);
}

const src = openPdf(readFileSync(from), { maxPages: Number.POSITIVE_INFINITY });
const out = await PDFDocument.create();
for (const p of src.pages) {
  const img = renderPdfPage(p, "full", { fullDpi: dpi });
  const png = await out.embedPng(img.bytes);
  const page = out.addPage([p.widthPt, p.heightPt]);
  page.drawImage(png, { x: 0, y: 0, width: p.widthPt, height: p.heightPt });
  console.log(`page ${p.index + 1}: ${img.width}×${img.height} px at ${dpi} dpi`);
}

if (existsSync(to)) {
  const backup = to.replace(/\.pdf$/i, ".before-flatten.pdf");
  copyFileSync(to, backup);
  console.log(`Kept the old file as ${backup}`);
}
writeFileSync(to, await out.save());

const check = openPdf(readFileSync(to), { maxPages: Number.POSITIVE_INFINITY });
console.log(`Wrote ${to}: ${check.totalPages} page(s), text layer: ${check.textChars ? `${check.textChars} chars (unexpected!)` : "none"}`);
if (check.textChars) process.exit(1);
