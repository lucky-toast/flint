# Inputs

Drop the four source files here. Everything in this folder except this README is gitignored, so real designs never get committed.

| File | What it is | Notes |
|---|---|---|
| `pdf-text.pdf` | High-quality, full-size PDF of a design **with selectable text** | Its text layer is extracted and sent alongside the page images in the `raster+text` cases. |
| `pdf-flat.pdf` | The same kind of PDF **without** a text layer (flattened / outlined / scanned) | Only page images are sent. Comparing it with `pdf-text.pdf` shows what the text layer adds. |
| `design.png` | A PNG of a design made on a computer | Full resolution, as exported. |
| `sketch.jpg` | A photograph of a hand-sketched design | Straight off the phone. `.jpeg` or `.png` also work (rename to `sketch.jpeg` / `sketch.png`). |

A missing file is skipped with a warning, so you can run with only some of them.
