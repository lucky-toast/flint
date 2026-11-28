---
name: mockup
description: Show three rough visual options for a UI idea as images that look like the real Flint app (its colors, type, slips and chat), not wireframes and not working code. Use when the user types /mockup, asks to "mock up" something, asks "what would X look like", wants to see options or variations for a layout, screen, panel or component, or is weighing where something should go on the page. Use it even when they don't say "mockup" but clearly want to see a design before it gets built.
---

# Mockup

The user wants to **see** a few directions before anything gets built. Give them three pictures that look like their own app, each a different answer to the same question. Then they pick one, or say "the header from B with the chips from C".

These are pictures, not prototypes. Nothing in `src/` changes. The aim is "roughly what it would look like", fast.

## What went wrong before, so don't repeat it

- **Wireframes were hard to read.** Grey boxes and labels made the user ask for "a mockup in my own style, showing what it would really look like". Use the app's real look from the start.
- **Building each option in the running app was too much.** Restyling the live app and screenshotting it worked, but it is slow and is more than the user wants. A static page per option is enough.
- **A split that broke one thing into two halves was rejected** ("the left and right chat history vs message input is awful"). Keep things that read as one unit together, in their natural reading order.

## Steps

### 1. Pin the question and pick three different answers

Say in one line what the three images will answer, e.g. "Three places for the chat: right column (today), strip above the slips, docked at the bottom."

The three must differ in **structure**: layout, placement, hierarchy, what's primary. Not three colorings of one layout. When the user names options ("above or below the slips?"), use theirs and fill the rest with the strongest alternative. Include today's layout as one of the three only when the question is "should we move it".

If the request is too vague to draw anything, ask one short question. Otherwise just go.

### 2. Borrow the real look

The mockups load the app's own stylesheet, so the real classes give the real look:

```html
<link rel="stylesheet" href="../../src/web/styles.css">
```

(Path is from `mockups/<topic>/`. Adjust if you put the files elsewhere.)

Then read only what you need:
- `src/web/styles.css`: the tokens on `:root` (`--line`, `--muted`, `--accent`, `--selection`, background `#efebe7`) and the class rules for the parts in the picture.
- The components the picture shows (`src/web/editor/`, `src/web/chat/`, `src/web/SlipPreview.tsx`, ...) to copy their markup and class names as plain HTML.
- `src/data/` for realistic sample content: the demo shop, the orders (#1001, the gift order #1002, the large order #1003), real chip labels. Real content makes a mockup readable; "Lorem ipsum" makes it look like a wireframe again.

For the slips, the real thing reads best and is cheap to get: start the app once (`node scripts/dev.mjs --port 8790` in the background), open it with Playwright, and save each slip iframe's `srcdoc` to `mockups/<topic>/_slip-*.html` (plus a `today.png` screenshot for reference). The mockups then show them with `<iframe src="_slip-0.html">` scaled onto a `.slip-desk`. To show a slip after an edit, copy one and append a `<style>` override (e.g. a bigger `.logo`). Stop the server when done. If the app won't start, a simplified slip in the real slip styles is fine.

When the idea has two states (e.g. "on launch" and "comparing"), stack one 1440×900 frame per state in the same page and render with `--full`.

### 3. Write one static HTML file per option

Put them in `mockups/<topic>/a.html`, `b.html`, `c.html` (short kebab-case topic, e.g. `chat-placement`). Plain HTML and CSS, no scripts, no React.

- **Only the part in question needs care.** The rest of the page (header, toolbar, the other pane) should be present so the option sits in context, but it can be approximate.
- Write variant-specific layout in a `<style>` block after the stylesheet link, using the same tokens, so new elements look native.
- Show the honest case, not just the flattering one: if an option covers the slips or gets cramped with a long order, let the picture show it.
- Add a small label in a corner (`A · Docked at the bottom`) in a style that's clearly not part of the design, so screenshots stay identifiable once they're out of context.

### 4. Render to PNG

```bash
node .claude/skills/mockup/scripts/render.mjs mockups/<topic>/a.html mockups/<topic>/b.html mockups/<topic>/c.html
```

It writes `a.png` etc. next to each file, at 1440×900 by default. Options: `--width 1920 --height 1080`, `--full` for the full page height. It uses the project's Playwright and finds the already-installed Chromium, so nothing is downloaded. Use the in-app browser only if the script can't run; its captures have cropped before.

### 5. Look before sending

Open each PNG with Read. Fix only things that make the picture misleading or broken: overlapping text, a missing stylesheet (unstyled page means the link path is wrong), an option that came out the same as another. Don't polish. One pass, then send.

### 6. Send and ask

Send the three PNGs in one `SendUserFile` call, in order A, B, C. In the message, one short entry per option: its name, what changes, and its main cost. Then say which you'd pick and why, in a sentence or two. Ask which direction to take; offer to build the chosen one or do another round mixing parts.

Leave the files in `mockups/`; it is in `.gitignore`, so they never get committed.

## When not to use this

- The user wants the change built. Build it.
- The question is about behavior or state, not looks. Use the `prototype` skill.
- They want options they can click through in the real app with real data. That's the `prototype` skill's UI branch.
