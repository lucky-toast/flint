# Flint

A browser app where sellers customize their packing-slip templates by chatting with **Flint**, a small helper powered by Meta's **Muse Ember**. Flint makes small, validated edits to a Liquid template, and the seller sees the result next to the original before saving.

**Constraints:** solo build, public repository, Muse Ember is the only LLM, total Muse Ember spend must stay under $10 (going over disqualifies the entry). Submissions are due Dec 2, 9 PM ET, and the demo video is recorded by Nov 30. The app is standalone: no code is taken from the seller's existing Electron app or its in-progress port.

## Problem Statement

Small online sellers print packing slips from Liquid templates. When a seller wants a change, even a small one like a bigger logo, hidden prices on gift orders, or items sorted differently, they have to ask a developer to edit the template code. They wait, they can't experiment, and they can't see what a change will do to their real orders until it's done. Changes that depend on order data ("orders over $200 get a free item") are especially hard to describe and check.

## Solution

The seller picks their shop and a template, then opens an editor with three panes: the **original** slip, the **working** slip, and a chat with **Flint**. They describe the change in plain English. Flint asks for clarification when the request is vague or too big, asks for an image when one is missing, and otherwise edits the template. Every edit is checked against every example order before the seller sees it. The working pane updates and shows a short "what changed" line, plus a warning if line items went missing or got duplicated. The seller can switch example orders to see how the slip looks for a gift order, a big order or an international order. They can also undo, try again, save the result as a new template or overwrite one of their own, download the Liquid, or print.

Judges and visitors without an access code get a **replay mode** that plays recorded responses for the scripted demo requests, so the public URL always works without spending budget.

## User Stories

### Choosing what to edit
1. As a seller, I want to pick my shop from a list, so that I see my own branding, assets and orders.
2. As a demo viewer, I want to switch between three demo shops (Kiln & Co. ceramics, Second Stitch vintage clothing, Sticker Barn stickers and prints), so that I can see Flint works for different kinds of businesses.
3. As a seller, I want to see the built-in templates (Classic, Compact, Boutique) alongside my own saved templates, so that I can start from either.
4. As a seller, I want each template preview rendered with my shop's default example order, so that I can judge it on realistic content.
5. As a seller, I want a "Customize with Flint" button on a template, so that I can start editing it.

### Seeing the result
6. As a seller, I want the original slip pinned next to the working slip, so that I can compare before and after.
7. As a seller, I want the working slip to show the latest accepted version, so that I always see what I'd save.
8. As a seller, I want to switch the example order and have both slips re-render instantly, so that I can check a change against a gift order, a big order or an awkward one.
9. As a seller, I want a short "what changed" line under the working slip (e.g. "#1003: 1 item missing · prices hidden on 1 order"), so that I know the effect without reading code.
10. As a seller, I want a warning when line items are missing from the slip, naming the item and order, so that I catch an edit that silently dropped things.
11. As a seller, I want a warning when line items appear more than once, so that I catch an edit that duplicated things.
12. As a seller, I want those warnings to inform rather than block, so that I can still keep an edit where I hid or combined items on purpose.
13. As a seller, I want a brand-new line (like a promo item) not to count as an "extra item", so that intended additions don't raise false alarms.
14. As a curious seller, I want a hidden-by-default "show code" toggle with the Liquid source and a diff against the original, so that I can look under the hood if I want.
15. As a seller, I want the slip preview sized to the template's paper (Letter, A4 or 4×6), so that it looks like what will print.

### Talking to Flint
16. As a seller, I want to type a request in plain English, so that I don't need to know Liquid.
17. As a seller, I want a "Flint is thinking…" indicator from send until reply, so that I know my request is being handled (data-logic edits take a few seconds).
18. As a seller, I want Flint to confirm each edit with one cheerful line, so that I know what it did without technical talk.
19. As a seller, I want Flint never to show me code or its own internal commentary in the chat, so that the conversation stays about my slip.
20. As a seller, when my request is vague ("make it nicer"), I want Flint to ask what I mean with two to four quick-reply chips, so that I can answer in one tap.
21. As a seller, when my request is too big ("redesign everything"), I want Flint to suggest breaking it into steps as chips ("Header", "Items table", …), so that I can go one piece at a time.
22. As a seller, when my request is out of scope or small talk, I want Flint to reply briefly and offer the closest thing it can do in the template, so that I'm not stuck.
23. As a seller, I want to tap a chip to send it as my reply, so that answering is quick.
24. As a seller, when Flint can't make a change cleanly after its retries, I want it to say so and suggest rewording, with the working slip unchanged, so that a broken template never replaces a good one.
25. As a seller, when a request is too much for one go, I want Flint to ask me to break it down, so that I know how to proceed.
26. As a seller, I want messages capped at a reasonable length (500 characters), so that I'm nudged toward focused requests.

### The scripted capabilities
27. As a seller, I want to make my logo bigger, so that my brand stands out.
28. As a seller, I want to add another image (such as an eco-friendly badge) to the header, so that I can show certifications.
29. As a seller, I want items sorted by quantity, then by SKU, so that packing is faster.
30. As a seller, I want a separate items table for each value of an item option (e.g. one table per glaze, or foil and non-foil), so that items are grouped the way I pack them.
31. As a seller, I want orders over $200 to show a "free promo item" line, so that I can reward big orders, and I want it to disappear on smaller orders.
32. As a seller, I want prices hidden on gift orders and shown on all others, so that gift recipients don't see what was paid.
33. As a seller, I want the gift message printed on gift orders when there is one, so that the recipient sees the buyer's note.

### Images
34. As a seller, when Flint needs an image I haven't provided, I want it to ask me to upload one, with an Upload button in its message, so that I know exactly what it needs.
35. As a seller, I want to give the uploaded image a name when I upload it, so that I and Flint can refer to it later.
36. As a seller, I want Flint to carry on with my original request once I've uploaded the image, without me retyping anything, so that the flow feels continuous.
37. As a seller, I want my uploaded images kept in this browser for my shop, so that they're there next time.
38. As a seller, I want a clear error when an image is too large to store, so that I know to use a smaller file.
39. As a seller, I want Flint to refuse to reference an image I don't have, so that my slip never shows a broken image.

### Undo, try again, save
40. As a seller, I want Undo to step back one version, so that I can reverse an edit I don't like.
41. As a seller, I want an undone turn to stay visible in the chat with an "undone" mark, and to be forgotten by Flint, so that Flint doesn't build on a change I rejected.
42. As a seller, I want Try again to undo the last edit and ask Flint for a different approach to the same request, replacing its previous reply, so that I can get an alternative in one click.
43. As a seller, I want Save to offer "Save as new" by default, with a suggested name, so that I don't lose the original.
44. As a seller, I want to overwrite one of my own saved templates, so that I can refine it over time.
45. As a seller, I want built-in templates never to be overwritten, so that I can always start fresh.
46. As a seller, I want the original pane to reset to the saved version after saving, so that further edits compare against what I saved.
47. As a seller, I want to be asked before discarding or closing with unsaved changes, so that I don't lose work by accident.
48. As a seller, I want to download the template as a .liquid file, so that I can use it in my production app.
49. As a seller, I want to print or save as PDF with the right paper size, so that the output matches my printer.

### Access, budget and replay
50. As a judge with the access code, I want to use Flint live with any request, so that I can test it for real.
51. As a visitor without a code, I want a replay mode with a visible "Replay" badge and suggestion chips for the scripted requests, so that I can see the full demo without spending budget.
52. As a visitor in replay mode who types free text, I want a friendly note that live mode needs an access code, pointing me at the chips, so that I understand the limit.
53. As the builder, I want a global token budget enforced server-side, so that spending can never pass the cap.
54. As the builder, I want per-IP and per-session rate limits, so that one visitor can't drain the budget.
55. As a visitor when the budget or rate limit is hit, I want a friendly "Flint is resting" message with replay still available, so that the app still works.
56. As the builder, I want a kill switch that turns live mode off, so that I can stop all spending instantly.
57. As the builder, I want a status endpoint reporting whether live mode is on and how much budget remains, so that the UI and I can see where things stand.

### Safety
58. As a visitor, I want slips rendered in a sandbox where scripts can't run and nothing loads from other sites, so that a malicious or hijacked edit can't run code or leak order data.

## Implementation Decisions

### Modules
- **Core** (framework-agnostic, meant to port into the Electron app later): the Liquid environment and rendering, the data schema and the schema description given to Ember, tool definitions, the system prompt, the Ember Responses client, the turn loop, and the item-change counter. It's used by both the browser and the Worker.
- **Web** (Vite + React + TypeScript single-page app): shop switcher, template picker, editor (original pane, working pane, chat), save dialog, client-side state (version stack, chat history, saved templates and assets in `localStorage`), print stylesheet.
- **Worker** (one Cloudflare Worker): serves the static app and `/api/*`; hosts the budget Durable Object, rate limiting, access-code check and replay mode. Deployed on a subdomain of the builder's domain.
- **Data:** three demo shops, about six hand-written orders each, shop assets, the three built-in templates, and recorded replay responses.

### Data schema
Flint uses its own schema, deliberately not the Electron port's (that format isn't final). Money arrives pre-formatted next to raw numbers, so templates compare with numbers and print strings with no custom filters.

```ts
type Shop = {
  id: string; name: string; platform: "etsy" | "ebay";
  assets: Record<string, string>;        // name -> URL or data URL; always includes "logo"
  orders: Order[]; defaultOrderId: string;
};
type Order = {
  id: string; label: string;             // picker label, e.g. "Gift order"
  number: string; date: string;          // ISO date
  buyer: string;
  isGift: boolean; giftMessage: string;  // "" when absent
  shippingAddress: { name; line1; line2; city; region; postalCode; country };
  subtotal: number; shipping: number; discount: number; tax: number; total: number; currency: string;
  subtotalFormatted: string; shippingFormatted: string; discountFormatted: string;
  taxFormatted: string; totalFormatted: string;   // discount and tax are 0 when absent
  lineItems: LineItem[];
};
type LineItem = {
  title: string; sku: string; quantity: number;
  options: Record<string, string>;       // variations, e.g. { Glaze: "Speckled", Size: "12 oz" }
  unitPrice: number; unitPriceFormatted: string;
  lineTotal: number; lineTotalFormatted: string;
  personalization: string;               // "" when absent
};
type Template = { id: string; name: string; builtIn: boolean; paper: "letter" | "a4" | "4x6"; source: string; updatedAt: string };
```
- `options` replaces the earlier `category` idea. It mirrors the name/value variations Etsy and eBay send. Every item in a shop has the same option keys, because strict variables would otherwise throw when grouping.
- Optional text fields are present as `""`, never missing, so strict variables never throws on them. Templates guard them with `if`.
- Order-level `tax` comes from the marketplaces, so every built-in template shows it in the totals. `discount` is there so the totals add up: `total = subtotal + shipping - discount + tax`. Both are always present, as 0 when absent.
- Render context: `{ shop: { name, platform }, assets, order }`. A template renders one order; a host that prints several renders it once per order.
- Orders per shop: typical · gift with message · over $200 · large mixed (3+ distinct option values, quantity ties) · single item · awkward (long names, empty optional fields, international).
- Assets: each shop ships `logo` plus one or two extras. Uploads become data URLs in `localStorage`, keyed per shop (about 200 KB cap each). Templates reference images only as `assets.<name>`.

### Running inside the seller's app
See `docs/adr/0001-embed-flint-in-the-sellers-app.md`. This is for the demo video only, and the app's side is built in the app's rewrite, not here. This repository only defines the contract and Flint's embedded mode.
- The app opens the deployed Flint in an Electron view. Its preload script exposes `window.flintHost`. When the bridge is present, Flint runs in **embedded mode**; without it, Flint behaves exactly as it does on the web.
- The bridge contract, defined as a TypeScript type in this repository for the app to implement:
  - `open()` returns `{ template: { name, paper, source }, shop: Shop, accessCode }`.
  - `save({ mode: "overwrite" | "new", name, paper, source, assets })` resolves once the app has written the file. `assets` holds the uploaded images (name to data URL) that the saved template uses, so the app can print it.
  - `onCloseRequested(handler)` is how the app's Back button asks to close, and `close()` is how Flint tells the app it can close.
- Embedded mode opens straight into the editor on the app's template and the app's shop. There is no shop switcher and no template picker. The example-order switcher stays, using the shop's mock orders.
- The access code comes from `open()`, so nothing is typed. The app keeps it in a local setting that is never committed.
- The save dialog looks the same. Overwrite replaces the template the app opened, and Save as new adds a template to the app. Saving goes only to the app, not to Flint's browser library. The original then resets to the saved version, as it does on the web.
- When the app's Back button asks to close, Flint runs its usual unsaved-changes prompt and calls `close()` once the seller agrees. Closing the window falls back to the browser's leave-page prompt.
- The shop is mock data in Flint's shape: name, platform, assets and sample orders. Real orders are never sent, because that would break the privacy policy. Later, sample orders could be generated from the seller's active listings.
- Turns carry the sent shop instead of a demo shop id. The Worker checks it against the schema, caps its size, and needs only the asset names, not the images.
- If Flint can't load, the app shows its own "you're offline" page.

### Liquid environment
- LiquidJS, all built-in tags and filters allowed, no custom filters, `strictFilters` and `strictVariables` on. The same environment runs in the browser and the Worker.
- Strict variables means an edit that references an asset the shop doesn't have fails validation and goes back to Ember like any other error.
- Multi-key sorting with built-ins works because LiquidJS `sort` is stable: sort by the secondary key, then by the primary key, reversing where needed. This was verified on 2,000 random orders.
- Grouping uses built-in `group_by`, which accepts nested paths such as `options.Glaze` (verified on LiquidJS 10.30.1).

### Built-in templates
- **Classic** (Letter/A4, the demo template): logo header, order details, ship-to, gift message, items table, totals, thank-you.
- **Compact** (4×6): black and white, dense, no prices, big order number.
- **Boutique** (Letter/A4): script heading, centered, personal-note box.
- Each starts simple and leaves room for the demo edits: name sort, one items table, prices shown, no promo logic. Paper size is metadata that drives the preview size and the print page size.
- Items tables use full width with fixed table layout. Narrow columns (quantity, SKU, price) get percentage widths through column classes, and the title column is flexible. Tables Ember copies when splitting keep the classes, so they line up. Added or removed columns take from or give back to the title column, so the overall width never changes.

### Ember API contract
- Responses API at Meta's `/v1/responses` endpoint, bearer auth, model `muse-ember-1.0`, **stateless** (`store: false`, with encrypted reasoning content requested and resent within a turn's retries).
- Request: the system prompt as instructions (resent every request); input is the user message containing the working template and the request, followed by any retry items. Tools are declared as functions, with `tool_choice: "auto"` (the only supported value, so plain-text replies must be handled), `parallel_tool_calls: false`, reasoning effort `low` (Ember's default is max), and `max_output_tokens: 4000` (this includes reasoning).
- Tool calls arrive as `function_call` output items. Ember may also emit a `message` item, which is ignored when a tool is called.
- `status: "incomplete"` is treated as truncated output.
- Stable content (instructions, schema, asset names, tools) goes first so the prefix caches. About 87% of input was cached in testing.
- Chat history is trimmed to about the last 10 turns. Undone turns are dropped from the history sent to Ember.

### Tools
| Tool | Arguments | Effect |
|---|---|---|
| `edit_template` | `edits: {find, replace}[]`, `summary` | Edits applied in order; each `find` must match exactly once |
| `ask_clarification` | `question`, `options?` (2–4) | Chat bubble with chips |
| `request_asset` | `description` | Chat bubble with an Upload button |
| `reply` | `message` | Chat bubble |

### System prompt
It covers the persona, the rules below, the typed schema with example values and "may be empty" notes (no sample order), the asset names available for the shop, and how to write edits.
- Make the smallest change that does what the user asked; don't restyle or reorganize anything else.
- Prefer the simplest change: chain filters rather than adding loops, and never hard-code numeric limits like `(1..1000)`.
- Every line item must still appear on the slip unless the user asked to hide or combine items.
- If the request is vague or could mean very different things, call `ask_clarification` instead of guessing.
- If the request needs an image that isn't in the available assets, call `request_asset`.
- If the request is out of scope, call `reply` and offer the closest thing you can do in the template.
- Fields marked "may be empty" can be blank, so guard them with `if`.
- Always call exactly one tool.
- One earned Liquid note: ranges only count up, so `(5..1)` produces nothing; to count down, use `(1..5)` reversed. This is the only one so far, because all three failures in the capability test were descending ranges. Built-in Liquid isn't otherwise explained, and further notes are added only with the same kind of evidence.

### Turn loop (Worker)
1. Receive the shop id, working template, history, message and optional retry hint. If the access code is valid, use live mode; otherwise use replay.
2. Check rate limits and reserve the worst-case token cost in the budget Durable Object. If either fails, answer from replay or with "Flint is resting".
3. Up to three attempts (the first plus at most two retries), each followed by settling the actual usage in the budget object:
   - **Truncated:** return a "too big" error. Don't retry.
   - **No tool call:** send the reasoning and message back with a nudge. Before any rejection in the turn, the nudge asks for exactly one tool call (`edit_template`, `ask_clarification` or `reply`), because Ember sometimes says it's making a change and then stops. If every attempt is only text, return the last text as a reply. After a rejection, the nudge asks Ember to call `edit_template` with the fix, and text is never returned.
   - **A tool other than `edit_template`:** return it.
   - **`edit_template`:** apply the edits, parse, then render against every example order for the shop, using placeholder assets. If that succeeds, return the new template and summary. If not, send the reasoning, function call and a `function_call_output` saying the edit was rejected, with the specific error, that the template is unchanged, and that it should call `edit_template` again.
4. After the last attempt fails, return an "invalid" error.
- **Retry strategy:** feedback only (send the error back). There's no fresh final attempt.
- The browser re-renders with the real assets and computes the what-changed line and the item warnings. Uploaded images never go to the Worker. In embedded mode, saving hands the ones the template uses to the host app.

### Item-change counter (browser)
After each accepted edit, it renders every example order before and after and counts how many times each existing line item's title appears. It produces the what-changed line, the "⚠️ Missing items" warning (naming items and orders) and the "⚠️ Extra items" warning. This uses no tokens. It never blocks an edit. Only existing items are counted, so new lines aren't "extra".

### Uploads
When Ember calls `request_asset`, the seller uploads an image and gives it a name. The browser stores it as `assets.<name>` and sends a follow-up turn in the same conversation saying the user supplied the `<name>` resource. Ember then continues with the original request. Whether Ember reliably continues from this message is unverified and must be checked once built.

### Preview safety
Slips render in a sandboxed iframe with scripts disabled, under a content security policy that allows only the document's own content and data URIs: no scripts, no network connections, no objects or frames, no form submissions, no base URI. Template content can be any HTML, CSS and Liquid. The policy blocks the remaining risks: scripts running on the app's domain, and remote image or CSS URLs that could carry order data elsewhere. No extra validation rule is needed. Printing works from the iframe.

### Worker API
- `POST /api/turn` takes `{shopId | shop, templateSource, history, message, retryHint?}`, where `shop` is a shop sent by a host app (see "Running inside the seller's app") and returns one of `edit` (new template plus summary), `ask` (question plus options), `asset` (description), `reply` (message) or `error` (`too_big` | `invalid` | `resting`). The access code comes in a request header.
- `GET /api/status` returns `{live, budgetRemainingPct}`.
- Bindings and config: the budget Durable Object, a rate-limit binding, secrets for the model API key and access code, a token-budget variable and a live-mode kill switch. Locally, secrets live in an ignored dev-vars file. Only an example env file is committed.

### Budget protection
| Layer | Mechanism | Default |
|---|---|---|
| Access code | Without a valid code the request is served in replay mode | Shared with judges |
| Global cap | Budget Durable Object: reserve the worst case before each call, settle after, refuse at the cap; cached input is tracked separately | **$3**, leaving room under the $10 limit for development and recording |
| Rate limits | Workers rate-limiting binding; a Durable Object per session | About 10 messages/min per IP; 50 live messages per session (browser tab) in total |
| Per call | 4,000 output-token cap, at most 2 retries, no retry on truncation | |
| Input | Message ≤ 500 characters, history about 10 turns | |
| Kill switch | Live-mode variable off | |
- Pricing for `muse-ember-1.0`: $0.10 per 1M input tokens, $0.004 per 1M cached input, $0.50 per 1M output. With about 87% of input cached, output is about 93% of the cost, so saving money means capping output and reasoning, not shortening prompts. Measured cost is about $0.0004 per message.
- The Meta spend alert only sends an email and doesn't stop usage. Check the usage page daily.

### Replay mode
Recorded live responses for the eight scripted requests on Kiln & Co. with the Classic template. The UI shows a "Replay" badge and suggestion chips. Free text gets "Live mode needs an access code; try one of these 👇".

### Flint's persona
Cheerful and brief, one-line confirmations, light emoji, never talks code to the seller. Ember's side commentary alongside a tool call and any plain text during a retry are never shown.

### Schedule
| Date | Work | Done when |
|---|---|---|
| Nov 26 | Scaffold, test tooling, core (Liquid, prompt, tools, Ember client, turn loop), fixtures, live `/api/turn` | Classic renders for all orders; sort, promo and gift-price requests work through the API |
| Nov 27 | Editor: panes, order picker, chat, clarify/asset/reply handling, chips, named upload, asset store, undo, try again, what-changed and warnings | All eight scripted cases work end to end |
| Nov 28 | Shop switcher, 3 shops × ~6 orders, 3 templates, picker, save/overwrite/discard, download, print, budget object, rate limits, access code, replay recordings, deploy | Public URL works live and in replay, in all shops |
| Nov 29 | Worker and Playwright tests, persona pass, empty and error states, polish. Feature freeze | Demo runs cleanly three times in a row |
| Nov 30 | Record the demo video | Video done |
| Dec 1–2 | README, usage screenshot (Nov 23–Dec 2, filtered to Muse Ember), fixes, submit | Submitted before Dec 2, 9 PM ET |

### Demo script (about 3 minutes)
1. The problem (20 s): sellers wait on a developer to change their packing slip.
2. Classic template, Kiln & Co., big order #1003, open Flint.
3. "Sort items by quantity, then SKU": the items re-sort.
4. "Show a separate table for each glaze": grouped tables.
5. "Orders over $200 get a free mystery mini planter": a promo line appears; switch to a small order and it's gone.
6. On a gift order, "Hide prices on gift orders": prices disappear; switch back and they're there.
7. "Add my eco-friendly badge": Flint asks for an upload, and the badge appears.
8. "Make it look nicer": clarification chips, then "Bigger logo".
9. Undo once, Save as new, Print.
10. Close: every edit is checked against every example order, and it's Liquid, so it drops into the production app.

11. Inside the seller's app (about 20 s): "Design with Flint" opens Flint on the app's template, a quick edit, Save, and the app's template file has changed.

The demo shows only what was built during the hackathon. The seller's app appears only as the host in step 11, labelled on screen as pre-existing, apart from its new menu item and bridge.

## Testing Decisions

- **What makes a good test:** it exercises external behavior through a seam (an HTTP request in, a response out; a user action in the browser, something visible on screen) and doesn't reach into internals. A test should survive refactoring the core.
- **Seam 1, the Worker's HTTP API.** Tests run in Cloudflare's Workers Vitest pool, which runs the real Workers runtime locally at no cost, so the Durable Object, rate-limit binding and env behave as deployed. Ember is faked at its outbound HTTP call with recorded and hand-written responses. They cover:
  - each tool outcome
  - a rejected edit fixed on retry
  - a `find` that matches zero or several times
  - text during a retry
  - truncation with no retry
  - running out of retries
  - a missing asset failing validation
  - budget reserve, settle and refusal at the cap
  - rate limits
  - access code versus replay mode
  - the kill switch
  - status reporting
- **Seam 2, the browser.** Playwright runs against `wrangler dev`, with the Worker pointed at the same fake Ember, so CI spends nothing. It covers:
  - picking a shop and template
  - each scripted request
  - chips
  - a named upload with an automatic follow-up
  - undo and try again, including the chat's "undone" mark
  - switching example orders
  - the what-changed line and the missing-item and extra-item warnings
  - save as new, overwrite (and built-ins never overwritten)
  - unsaved-changes prompts
  - download
  - replay mode and its free-text message
  - the preview sandbox refusing a script
- **Below the seams:** nothing by default. Quick unit tests are allowed only where a piece turns out to be fiddly, such as applying edits or counting items. The project isn't strictly test-first.
- **Model quality** isn't tested in CI. It's checked with live runs of the earlier capability-test harness: pass rates on the scripted requests, plus a visual review of before/after renders.
- **Prior art:** none in this repository yet. These seams are the first tests.

## Out of Scope

- Real Etsy or eBay OAuth or order data.
- Accounts, multi-user sync, or version history across sessions.
- Flint changing paper size.
- Any LLM other than Muse Ember.
- A mobile layout (desktop only).
- Template settings toggles (Flint edits the template directly instead, e.g. to hide prices).
- Porting `core` into the Electron app during the hackathon, and any code from that app or its port.
- Building the app's side of the embedded hook (menu item, view, preload bridge, offline page). That lands in the app's rewrite.
- Sample orders generated from a seller's live listings.

**Stretch goals, only if Nov 28 ends early:** image input, where the seller uploads a photo of a slip they like and says "make mine look like this" (Ember reads images natively) · Flint suggesting template names · per-item rules ("for mugs, add care instructions") · keyboard shortcuts.

## Further Notes

- **Evidence behind the setup:** a capability test compared two APIs × two edit modes × eight requests × 10 runs, and passed 99–100% everywhere. Responses API with find/replace was valid first try 100% of the time, averaged 609 output tokens and 1.8 s, and cost about $0.13 for 322 calls. Token counts matched Meta's dashboard exactly. The only failures were countdown loops over descending ranges, which removed every item while Flint claimed success. After adding the prompt rules and the range note:
  - The sort request passed 19 of 20, with no missing items (the miss was text during a retry, now handled).
  - The grouping request passed 20 of 20.
  - All eight requests passed 3 runs each (24 of 24).
- **Known risks:** a valid template can give a wrong result with a confident summary. The mitigations are the prompt rules, the item warnings, the side-by-side preview, and undo or try again. Fragile approaches (nested loops, manual table open/close) can pass now but break later edits, which the "simplest change" rule targets. A Meta API outage during judging is covered by replay mode and the recorded video. `localStorage` quota is covered by the per-asset cap and a clear error.
- **Open:**
  - Meta's billing page still showed $0.00 after about $0.14 of usage. That's likely lag or credits, so check before relying on it.
  - Confirm Ember continues correctly after a named upload.
- **Submission needs:** public repository, 3-minute demo video, project description, and a usage screenshot for Nov 23 to Dec 2 filtered to Muse Ember. Judging weights: impact 30%, use of Meta AI tooling 25%, technical depth 20%, demo 25%.
