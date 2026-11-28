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

## Make it look like this (real turns)

`turn-run.mjs` sends Flint's real first turn to Ember, with a design attached, and records what Ember does with it and what it actually costs. Every run starts from the app's defaults (Kiln & Co., the Classic template) and the seller message "make it look like this". The prompt, tools and request settings are a hand-copied snapshot of the app ([app-snapshot.mjs](app-snapshot.mjs), from main at 881e027). Update it by hand if the app changes.

- **Attachment:** it goes after the app's usual text, in the same user message. PDFs are sent as the file. Images are shrunk to at most 1.8 MP (`--max-pixels`), keeping their shape and never enlarged.
- **Each run mirrors the app's turn loop:** up to 3 calls, with rejected edits sent back the way the app sends them. The first outcome (edit, question, asset request or reply) ends the run, and questions aren't answered.
- **Logging:** everything is kept in `results/turns-<timestamp>/`. That's every console line (`run.log`) and every request and response in full (`calls/…`), including the attachment and the raw usage. `calls.jsonl` and `runs.jsonl` have one line per call and per run.
- **Summary:** `summary.html` shows the per-input token and cost tables, then each input's sent design next to the starting template. Below that is every run's outcome, with the edited template rendered for the default order. `summary.md` has the tables only.

```sh
npm run flatten                      # once: rebuild inputs/pdf-flat.pdf from pdf-text.pdf with no text layer
node turn-run.mjs --dry-run          # build and save each input's request; no calls
node turn-run.mjs --runs=1           # a first look: 4 runs
node turn-run.mjs --runs=10          # the full batch: 40 runs (at most 120 calls)
node turn-summary.mjs results/turns-<timestamp>   # rebuild the summary any time
```

Guardrails: `--max-calls` (200) and `--max-cost-usd` ($1.00) stop the run early. A 40-run batch should cost a few cents.

## Files

- `token-count.mjs`: options, the calls, logging and the summary.
- `cases.mjs`: which cases exist for each source.
- `turn-run.mjs`: the real-turn runner. `turn-summary.mjs` builds its summary, `app-snapshot.mjs` is the copied prompt, tools, shop and template, and `flatten-pdf.mjs` makes the text-free PDF (with [pdf-lib](https://pdf-lib.js.org/)).
- `media.mjs`: image resizing ([sharp](https://sharp.pixelplumbing.com/)) and PDF rendering and text extraction ([MuPDF](https://mupdf.com/), WASM). MuPDF is AGPL. That's fine for a local measuring script, but don't copy it into the app.
