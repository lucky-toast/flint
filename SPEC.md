# Flint — spec & implementation plan

> A browser app where sellers customize their packing-slip templates by chatting with **Flint**, a small helper powered by Meta's **Muse Ember**. Flint makes small, validated edits to a Liquid template; the seller sees the result next to the original before saving.

**Constraints:** solo, public repo, Muse Ember is the only LLM, **total Muse Ember spend under $10** (going over disqualifies). Submission due **Dec 2, 9 PM ET**; demo video recorded by **Nov 30**.
**Status:** design settled (open questions resolved Nov 26, see §13); model setup validated by the limit test (§11).

---

## 1. Problem & scope

The production app (Electron) renders packing slips from Liquid templates. Today sellers ask the developer to edit the Liquid. Flint lets them do it in plain English. This hackathon build is a **completely standalone, independent** public app: nothing is copied from the Electron app or its in-progress port, which was only consulted for how orders are shaped. Its `core/` is meant to port back into the Electron app later.

**Requests it must handle (also the demo script):**

| # | Request | Tests |
|---|---|---|
| 1 | Make the logo bigger | Cosmetic edit |
| 2 | Add another image (badge) to the header | Assets; asking for a missing upload |
| 3 | Sort items by quantity, then SKU | Data logic |
| 4 | Separate table per item option (e.g. glaze, foil / non-foil) | Restructuring |
| 5 | Orders over $200 get a "promo item" line | Conditional on order data |
| 6 | Hide prices on gift orders | Conditional on order data |

**Non-goals:** real Etsy/eBay OAuth or data, accounts, multi-user sync, version history across sessions, Flint changing paper size, any LLM other than Muse Ember.

---

## 2. Decisions

| Topic | Decision |
|---|---|
| Template language | **Liquid (LiquidJS), all built-ins allowed, no custom filters, `strictVariables: true`.** Template content is HTML + CSS + Liquid. |
| Independence | Standalone; **no code copied from the Electron app or its port.** Flint keeps its own data schema (§4); money arrives pre-formatted. |
| Preview safety | Slips render in a **sandboxed iframe** (no scripts) with a CSP: `default-src 'self' data:; script-src 'none'; style-src 'self' data: 'unsafe-inline'; connect-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'`. Blocks scripts and remote URLs (which could leak order data). No extra validation rule needed. |
| Testing | Not test-first. Worker tests with **`@cloudflare/vitest-pool-workers`** (runs locally in workerd, free); **Playwright** end-to-end against `wrangler dev` with the Worker pointed at a **fake Ember** replaying recorded responses ($0 in CI). Unit tests only where cheap (applying edits, item counts). Model quality stays in the limit-test harness. |
| Prompting about Liquid | Built-in Liquid is **not explained** unless the limit test shows Ember doesn't know it. One fact has been earned so far (ranges only count up, §5.4). |
| Stack | **Vite + React + TypeScript** SPA served by **one Cloudflare Worker** (static assets + `/api/*`), on a subdomain of your domain |
| Portability | All logic in a framework-agnostic **`core/`** (rendering, Ember client, tools, validation) |
| Model API | **Responses API**, **stateless** (`store: false`, encrypted reasoning resent on retries), `muse-ember-1.0` |
| Edit mechanism | Tool calling with **`edit_template` find/replace operations** |
| Reasoning & cap | `reasoning.effort: "low"`, `max_output_tokens: 4000` (includes reasoning) |
| Validation | Apply → parse → render against **every** example order. On failure, feed the error back; **max 2 retries** |
| Unclear requests | Flint **asks** (`ask_clarification`, `request_asset`); never guesses |
| Missing/extra items | **Warning only, never blocked** (§3.4) — sellers may hide, combine or add items on purpose |
| What Flint shows | The tool's `summary`; Ember's side commentary is never shown; plain text mid-retry is never shown (§3.3) |
| Context sent to Ember | Instructions (persona, rules, schema, asset names) + tools, then the working template and request in the user message. Stable content first so the prefix caches (87% cache hit in testing). **Typed schema with example values, no sample order.** Chat history trimmed to ~10 turns. |
| Budget | Durable Object token cap, rate limits, access code for live mode, replay mode for everyone else (§6) |
| Storage | `localStorage` per shop: saved templates and uploaded assets |
| Secrets | Worker secrets in production, `.dev.vars` locally, `limit-test/.env` for the test. All gitignored; only `.env.example` is committed |
| Built-in templates | Classic (Letter/A4), Compact (4×6), Boutique (Letter/A4); simple, written from scratch |
| Example data | 3 demo shops × ~6 hand-written orders (JSON fixtures) |
| Buddy | **Flint**: cheerful, brief, one-line confirmations, light emoji, never talks code to the seller |

---

## 3. User experience

### 3.1 Flow
1. **Pick a shop** (demo switcher): *Kiln & Co.* (ceramics), *Second Stitch* (vintage clothing), *Sticker Barn* (stickers/prints).
2. **Pick a template**: built-ins plus this shop's saved ones; preview uses the shop's default order.
3. **"Customize with Flint"** opens the editor.

### 3.2 Editor
```
┌───────────────────────────────────────────────────────────────────────┐
│ Kiln & Co. ▾   Classic (editing)     Example order: #1003 Big order ▾ │
│                                    [Undo] [Try again] [Save] [Discard]│
├──────────────────────┬──────────────────────┬─────────────────────────┤
│  ORIGINAL (pinned)   │  WORKING             │  🔥 Flint               │
│  rendered slip       │  rendered slip       │  chat, chips,           │
│                      │  what-changed line   │  upload button          │
│                      │  [show code]         │  [ message box      ]   │
└──────────────────────┴──────────────────────┴─────────────────────────┘
```
- **Original** stays fixed for the session; after **Save** it resets to the saved version.
- **Working** shows the latest accepted version. Switching the example order re-renders both panes instantly.
- **Show code** (hidden by default): Liquid source + diff vs original.
- **Undo** steps back one version, client-side, and **removes that turn from the history sent to Ember** (the chat keeps it with an "undone" mark). **Try again** = undo + resend the same message with a "different approach" hint; its reply replaces the old bubble.
- **"Flint is thinking…"** shows from send until reply (data-logic edits take 3–6 s).
- Desktop only; no mobile layout.

### 3.3 Flint's responses
| Situation | Ember does | UI |
|---|---|---|
| Clear request | `edit_template` | Working pane updates; bubble shows the tool's `summary` |
| Vague ("make it nicer") | `ask_clarification` + 2–4 options | Bubble with quick-reply chips |
| Too big ("redesign everything") | `ask_clarification` splitting it into steps | Chips ("Header", "Items table", …) |
| Missing image | `request_asset` | Bubble with **Upload**: seller picks the image **and names it**; the browser stores it as `assets.<name>` and sends a follow-up turn in the same history: "User supplied the `<name>` resource." Flint continues from there (**check Ember handles this well when built**) |
| Out of scope / small talk | `reply` or plain text (first attempt only) | Bubble, offering the closest template-level option |
| Edit still invalid after retries | (server) | "I couldn't make that change cleanly. Want to try wording it differently?" Working pane unchanged |
| Reply cut off | (server) | "That's more than I can do in one go. Can we break it down?" |

**Never shown to the seller:** Ember's commentary written alongside a tool call (technical, meant for itself), and any plain text during a retry (e.g. "retrying with the corrected count…" — it's narration, not an answer).

### 3.4 "What changed" and the missing/extra-item warning
Flint's summary is the model's claim; testing found confident wrong ones ("Sorted ✅" with every item gone). So after each edit the browser renders every example order before and after and **counts how many times each line item's title appears** (no tokens).
- **What-changed line** under the working pane, e.g. *"#1003: 1 item missing · prices hidden on 1 order."*
- **⚠️ Missing items** (e.g. *"11 items missing (Speckled Mug 12oz on #1001…)"*) and **⚠️ Extra items** (*"Extra items on #1003"*) — wording kept general.
- **The edit is still applied.** The seller keeps it or uses undo / try again.
- Only existing items are counted; a brand-new line (the promo planter) isn't "extra."

### 3.5 Saving & output
- **Save** → *Save as new* (default, Flint-suggested name) or *Overwrite* (own saved templates only; built-ins never).
- **Discard** / closing with unsaved changes asks for confirmation.
- **Download .liquid** and **Print / Save as PDF** (print stylesheet matches the paper size).

---

## 4. Data

```ts
type Shop = {
  id: string; name: string; platform: "etsy" | "ebay";
  assets: Record<string, string>;       // name -> URL/data URL; includes "logo"
  orders: Order[]; defaultOrderId: string;
};
type Order = {
  id: string; label: string;            // picker label, e.g. "Gift order"
  number: string; date: string;         // ISO date
  buyer: string;
  isGift: boolean; giftMessage: string; // "" when absent
  shippingAddress: { name; line1; line2; city; region; postalCode; country };
  subtotal: number; shipping: number; total: number; currency: string;
  subtotalFormatted: string; shippingFormatted: string; totalFormatted: string;
  lineItems: LineItem[];
};
type LineItem = {
  title: string; sku: string; quantity: number;
  options: Record<string, string>;      // variations, e.g. { Finish: "Foil", Size: "3 in" }; same keys on every item in a shop
  unitPrice: number; unitPriceFormatted: string;
  lineTotal: number; lineTotalFormatted: string;
  personalization: string;              // "" when absent
};
type Template = { id: string; name: string; builtIn: boolean; paper: "letter" | "a4" | "4x6"; source: string; updatedAt: string };
```
- Render context: `{ shop: { name, platform }, assets, order }`. Money is pre-formatted (`*Formatted`) next to raw numbers for comparisons.
- **Orders per shop (~6):** typical · gift with message · over $200 · large mixed (3+ distinct option values, quantity ties) · single item · awkward (long names, empty optional fields, international).
- **Assets:** each shop ships `logo` + 1–2 extras as SVGs. Uploads → data URLs in `localStorage` (`flint:<shopId>:assets`), ~200 KB cap. Templates reference `{{ assets.<name> }}` only.
- **Schema doc for Ember:** typed field list with example values and "may be empty" notes (`schemaDoc` in `limit-test/fixtures.mjs`).

---

## 5. Engine (`core/`)

### 5.1 Ember request (Responses API)
```jsonc
{
  "model": "muse-ember-1.0",
  "instructions": "<system prompt>",     // resent every request
  "input": [ {user: template + request}, …retry items ],
  "tools": [ {"type": "function", "name", "description", "parameters"} ],
  "tool_choice": "auto",                 // only supported value; text replies must be handled
  "parallel_tool_calls": false,
  "reasoning": { "effort": "low" },      // Ember always reasons; default is "max"
  "max_output_tokens": 4000,
  "store": false,
  "include": ["reasoning.encrypted_content"]
}
```
- Tool calls arrive as `output` items `{type: "function_call", call_id, name, arguments}`; Ember may also emit a `message` item (ignored when a tool is called).
- Retry: resend this turn's `reasoning` (encrypted) and `function_call` items, then `{type: "function_call_output", call_id, output}`. Ember keeps its reasoning (a real retry used 51 reasoning tokens vs 1,630 on the first attempt).
- Usage: `usage.input_tokens`, `output_tokens`, `output_tokens_details.reasoning_tokens`. Cutoff reporting is undocumented: treat `status: "incomplete"` as truncated.
- Endpoint: `POST https://api.meta.ai/v1/responses`, bearer auth.

### 5.2 Tools
| Tool | Args | Effect |
|---|---|---|
| `edit_template` | `edits: {find, replace}[]`, `summary` | Applied in order; each `find` must match **exactly once** |
| `ask_clarification` | `question`, `options?` | Bubble + chips |
| `request_asset` | `description` | Bubble + upload button |
| `reply` | `message` | Bubble |

### 5.3 Turn algorithm (server)
```
receive {shopId, templateSource, history, message, accessCode}
access code → live, else replay
rate limits + reserve worst-case tokens in BudgetDO → else replay / "Flint is resting"
for attempt in 0..2:
   call Ember; settle actual usage in BudgetDO
   if status == "incomplete": return error(too_big)
   if no tool call:
      if attempt == 0: return reply(text)
      append reasoning + message items, then user: "You replied with text but did not call
        edit_template, so nothing changed. Call edit_template now with the fix. Do not reply with text."
      continue
   if non-edit tool: return it
   apply edits → parse → render every example order (placeholder assets)
   if ok: return edit(template, summary)
   append reasoning + function_call, then function_call_output: "Edit rejected: <error>.
     The template is unchanged. Call edit_template again with the fix. Do not reply with text."
return error(invalid)
```
The browser re-renders with real assets and computes the what-changed line and warnings (§3.4). Uploads never leave the browser.

### 5.4 Prompt
Working draft: `systemPrompt()` in `limit-test/limit-test.mjs`. Rules:
- Make the smallest change that does what the user asked. Do not restyle or reorganise anything else.
- Prefer the simplest change: chain filters rather than adding loops, and never hard-code numeric limits like (1..1000).
- Every line item must still appear on the slip unless the user asked to hide or combine items.
- If the request is vague or could mean very different things, call `ask_clarification` instead of guessing.
- If the request needs an image not in the available assets, call `request_asset`.
- If the request is out of scope, call `reply` and offer the closest thing you can do in the template.
- Fields marked "empty" can be blank, so guard them with `{% if %}`.
- Always call exactly one tool.

Plus the schema, asset names, edit instructions and one **earned Liquid note**: *"ranges only count up, so (5..1) produces nothing. To count down, use (1..5) reversed."* (all 3 full-run failures were descending ranges). **Add further Liquid notes only with the same kind of evidence.**

### 5.5 Liquid environment
`new Liquid({ strictFilters: true, strictVariables: true })`, built-ins only. Strict variables also rejects references to missing assets (`assets.<name>` not uploaded), so those edits fail validation and go back to Ember. Shared by browser, Worker and (later) Electron.
- Multi-key sort works with built-ins: `sort: "sku" | reverse | sort: "quantity" | reverse` (LiquidJS `sort` is stable — verified on 2,000 random orders). Not portable to Shopify's Ruby Liquid. Ember produces this unprompted.
- Grouping: built-in `group_by` → `[{ name, items }]`. Nested paths work: `group_by: "options.Finish"` (verified, LiquidJS 10.30.1). With strict variables, a missing key throws, so fixtures give every item in a shop the same option keys.

---

## 6. Budget protection

| Layer | Mechanism | Default |
|---|---|---|
| Access code | `X-Flint-Code` vs `ACCESS_CODE` secret; without it → replay mode | Shared with judges |
| Global cap | `BudgetDO` (Durable Object): reserve worst case before a call, settle after, refuse at cap. Track cached input separately (25× cheaper) | `TOKEN_BUDGET` = **$3** (~$0.0004/message measured → ~7,500 messages), leaving room under the $10 limit for dev and recording. Check the usage page daily; the Meta spend alert only emails, it doesn't stop usage |
| Rate limits | Workers Rate Limiting binding | ~10 msg/min per IP, 20 per session |
| Per call | 4,000 output cap; ≤2 retries; no retry on truncation | |
| Input | Message ≤500 chars; history ~10 turns | |
| Kill switch | `LIVE_MODE=off` | |

**Pricing (official, `muse-ember-1.0`):** $0.10 / 1M input, **$0.004 / 1M cached input**, $0.50 / 1M output. With ~87% of input cached, **output is ~93% of the cost**: to save money, cap output and reasoning, not prompt length.

**Replay mode:** recorded live responses for the 8 scripted requests on Kiln & Co. + Classic, a "Replay" badge, and suggestion chips. Free text → "Live mode needs an access code; try one of these 👇".

---

## 7. Built-in templates
Simple; each leaves room for the demo edits (name sort, one table, prices shown, no promo logic). Paper size is metadata driving preview size and `@page` CSS.
- Items tables use `width: 100%; table-layout: fixed` with percentage widths on narrow column classes (qty, SKU, price) and a flexible title column. Tables Ember copies keep the classes, so split tables line up; added or removed columns take from or give back to the title column, so overall width never changes.
- **Classic** (Letter/A4): logo header, order meta, ship-to, gift message, items table, totals, thank-you. The demo template.
- **Compact** (4×6): black and white, dense, no prices, big order number.
- **Boutique** (Letter/A4): script heading, centred, personal-note box.

---

## 8. Architecture

```
flint/
├─ core/        liquid.ts · schema.ts · tools.ts · prompt.ts · ember.ts (Responses client) · turn.ts · itemChanges.ts
├─ web/         Vite + React: ShopSwitcher, TemplatePicker, Editor, Pane, Chat, SaveDialog; state/; print.css
├─ worker/      index.ts (/api/turn, /api/status, static assets) · budget-do.ts · replay.ts
├─ data/        shops/*.json · assets/*.svg · templates/*.liquid · replays/*.json
├─ limit-test/  test harness (§11)
├─ wrangler.toml · .gitignore · README.md
```
- **Worker:** static assets (`dist/`), Durable Object `BUDGET`, rate-limit binding, secrets `MODEL_API_KEY` + `ACCESS_CODE`, var `TOKEN_BUDGET`, custom domain.
- **API:** `POST /api/turn` `{shopId, templateSource, history, message, retryHint?}` → `{type: "edit"|"ask"|"asset"|"reply"|"error", …}`; `GET /api/status` → `{live, budgetRemainingPct}`.

---

## 9. Build schedule

Compressed: build Nov 26–29, video Nov 30, buffer Dec 1–2. It doesn't need to be perfect.

| Date | Work | Done when |
|---|---|---|
| Nov 26 | Scaffold repo, Vitest + workers pool, Playwright; `core/liquid.ts`, `prompt.ts`, `tools.ts` from the limit test; fixtures → `data/`; `core/turn.ts`, `ember.ts`, Worker `/api/turn` (live) | `core` renders Classic for all orders; #3, #5, #6 work through the API |
| Nov 27 | Editor: sandboxed panes, order picker, chat; clarify / asset / reply handling, chips, named upload, asset store; undo, try again; what-changed + warnings | All 8 scripted cases work end to end |
| Nov 28 | Shop switcher, 3 shops × ~6 orders, 3 templates, picker, save / overwrite / discard, download, print; BudgetDO, rate limits, access code, replay mode + recordings; deploy | Public URL works live and in replay, in all shops |
| Nov 29 | Worker tests, Playwright flows with fake Ember; Flint personality pass, empty/error states, polish. **Feature freeze** | Demo runs cleanly 3× in a row |
| Nov 30 | Record demo video | Video done |
| Dec 1–2 | README, usage screenshot (Nov 23–Dec 2, Muse Ember), fixes, submit | Submitted before Dec 2, 9 PM ET |

**Stretch:** **image input**: seller uploads a photo of a slip they like, "make mine look like this" (Ember reads images natively; only if Nov 28 ends early) · Flint suggests template names · per-item rules ("for mugs, add care instructions") · keyboard shortcuts.

---

## 10. Demo script (~3 min)
1. Problem (20 s): "Sellers wait on a developer to change their packing slip."
2. Classic, Kiln & Co., big order #1003 → open Flint.
3. "Sort items by quantity, then SKU" → re-sorts.
4. "Show a separate table for each glaze" → grouped tables.
5. "Orders over $200 get a free mystery mini planter" → promo line; switch to a small order, it's gone.
6. Gift order: "Hide prices on gift orders" → prices disappear; switch back, they're there.
7. "Add my eco-friendly badge" → upload request → badge appears.
8. "Make it look nicer" → clarification chips → "Bigger logo."
9. Undo once, **Save as new**, **Print**.
10. Close: "Every edit is checked against every example order, and it's Liquid, so it drops straight into the production app."

---

## 11. Limit test (`limit-test/`)

**Files:** `limit-test.mjs` (runner), `fixtures.mjs` (Classic template, 3 orders, 8 requests with checks), `review.mjs` (visual review page), `.env` (key; gitignored).

**Run:**
```bash
cd limit-test
```
```bash
npm install
```
```bash
node limit-test.mjs --dry-run
```
```bash
node limit-test.mjs
```
```bash
node review.mjs
```
- Defaults match the app (Responses, find/replace, low). `--only=<ids>`, `--runs=N`; `--apis=chat,responses --modes=tools,rewrite` repeats the original comparison. `--print-request` shows exact bodies; `--mock` runs offline. `node review.mjs results/<folder>` reviews an older run.
- **Spend guards:** worst case reserved before each call against `--max-calls` and `--token-budget`. Per-call timeout 180 s.
- **Cost:** official pricing, including cached input; the totals line shows the cache-hit rate.
- **Logging:** `results/<timestamp>/` — `calls.jsonl` (every raw request/response, written as it returns; key never logged), `runs.jsonl`, `config.json`, then `results.json` + `summary.md` (also on Ctrl-C/crash).

**Scoring:** edits must apply, parse and render on all orders, then pass the request's check. **Missing or extra items fail a run** (none of the test requests ask for them; opt out per request with `allowsItemChanges`). Text during a retry counts as a failed attempt. Checks are heuristics — use `review.mjs` (before/after renders, diffs, warnings) before trusting a pass rate.

**Results so far:**

| Run | Setup | Result |
|---|---|---|
| Full comparison | 2 APIs × 2 modes × 8 requests × 10 | 99–100% pass everywhere; Responses + find/replace: 100% valid first try, 609 avg output tokens, 1.8 s; 322 calls, ≈ $0.13 at official pricing (token counts matched the dashboard exactly) |
| ↳ failures | #3 only, 3/40 | Countdown loops over descending ranges `(999..0)` → every item vanished while Flint said "Sorted" |
| After prompt additions: #3 × 20 | Responses + find/replace | 19/20 pass, 0 missing items; reasoning down to ~1,060 tokens, ~3.3 s. The 1 miss ended in text narration mid-retry (now handled, §5.3) |
| #4 × 20 | same | 20/20 pass (1 fixed by retry) |
| All 8 × 3 | same | 24/24 pass; #7 still asks for clarification |

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| Valid template, wrong result, confident summary | Prompt rules + range note (§5.4); missing/extra-item warning and what-changed line (§3.4); side-by-side preview; undo / try again |
| Fragile approaches (nested loops, manual table open/close) that pass but break later edits | "Prefer the simplest change" rule; watch diffs in review |
| `find` text doesn't match | Specific error fed back; fixed on retry every time so far |
| Budget drained on the public URL | Access code, DO cap, rate limits; replay keeps the demo working |
| Meta API outage during judging | Replay mode; recorded demo video |
| `localStorage` quota | ~200 KB per asset; clear error |

**Open:** billing page still showed $0.00 after ~$0.14 of usage (likely lag or credits; check before relying on it) · confirm Ember continues correctly after a named upload (§3.3).

---

## 13. Resolved questions (Nov 26)

| Question | Decision |
|---|---|
| Retry strategy | Feedback-only: send the error back, as in §5.3 |
| Data schema | Keep Flint's own schema (the Electron port's format isn't final); `giftMessage` and gift orders supported; money pre-formatted |
| Item attributes | `options: Record<string, string>` replaces `category` |
| Liquid scope | All built-ins, `strictVariables: true`; missing assets fail validation |
| Settings toggles | None; Flint edits the template directly (e.g. hide prices) |
| Preview safety | Sandboxed iframe + strict CSP (§2) |
| Split-table alignment | Fixed table layout with column classes (§7) |
| Undo / try again | Undo removes the turn from Ember's history; try again = undo + resend with hint |
| Uploads | Seller names the asset; follow-up turn tells Ember it was supplied |
| Testing | Workers Vitest pool + Playwright with fake Ember; not test-first |
| Budget | `TOKEN_BUDGET` $3 |
| Schedule | Compressed (§9); all 3 shops and 3 templates kept; no mobile layout |
| Image input | Stretch goal |
