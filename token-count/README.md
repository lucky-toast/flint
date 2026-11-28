# Token count

How many Muse input tokens would each kind of design input cost? This sends each input to Muse's count endpoint, [`POST /v1/responses/input_tokens`](https://dev.meta.ai/docs/token-counting), at sizes from full down to 1024 px on the long edge. The endpoint only tokenizes. It generates nothing and stores nothing.

## Setup

```sh
cd token-count
npm install
cp .env.example .env    # then paste MODEL_API_KEY
```

Put the four inputs in `inputs/` (names and what each one is: [inputs/README.md](inputs/README.md)).

## Run

```sh
npm run dry-run   # prepares every case, prints sizes and payloads, makes no calls
npm run count     # counts them; add --save-media to keep the resized images
```

Results go to `results/<timestamp>/` (gitignored). `summary.md` has one table per source.

## What gets counted

Every request is one user message: the media, then the same short prompt. A prompt-only **baseline** is counted first, so each case's *media tokens* = its count − the baseline.

| Source | Cases |
|---|---|
| `pdf-text` (selectable text) | **file**: the PDF itself as `input_file` (Muse extracts the text and renders the pages on its side), at `detail` low and high. **raster**: pages rendered by us as `input_image`, at each size. **raster+text**: the same images plus the PDF's text layer as `input_text`. **text-only**: the text layer alone. |
| `pdf-flat` (no text layer) | **file** and **raster**, as above. |
| `design` (PNG) | **image** at each size. |
| `sketch` (photo) | **image** at each size. |

Sizes are long-edge pixels, `full,4096,3072,2048,1536,1024` by default (`--sizes`). "full" is the original file for images and a 300 dpi render for PDF pages (`--pdf-dpi`). Sizes at or above a source's own size are skipped. Each image case runs at `detail` `original` and `auto` (`--image-details`), since `auto` may let Muse downscale on its side and flatten the differences between sizes.

All options are listed at the top of [token-count.mjs](token-count.mjs).

## Caveat: media may be undercounted

[meta-models/meta-model-cookbook#58](https://github.com/meta-models/meta-model-cookbook/issues/58) (open) reports that this endpoint barely counts images and video: a 3000×2000 PNG counted about 171 tokens at every `detail`, and a video counted about 6% of what `/v1/responses` then billed. PDFs weren't tested. The summary lists any media case that adds under 300 tokens over the baseline. If any appear, check one against `usage.input_tokens` from a real `/v1/responses` call before relying on these numbers.

## Files

- `token-count.mjs`: options, the calls, logging and the summary.
- `cases.mjs`: which cases exist for each source.
- `media.mjs`: image resizing ([sharp](https://sharp.pixelplumbing.com/)) and PDF rendering and text extraction ([MuPDF](https://mupdf.com/), WASM). MuPDF is AGPL. That's fine for a local measuring script, but don't copy it into the app.
