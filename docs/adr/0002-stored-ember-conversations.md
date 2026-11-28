# Keep Ember conversations on Meta's side, chained with previous_response_id

Flint now calls Ember with `store: true`. A follow-up request (a retry today, and a tweak once #42 lands) chains from the previous response with `previous_response_id` and sends only what's new: the feedback, the tool result or the tweak. Every request also sends `prompt_cache_key: "flint-<shopId>"`. Instructions, tools and the cache key are resent each time, because they don't carry over a chain. This replaces the stateless design, where Flint resent the whole conversation every time, with encrypted reasoning.

The #40 tweak experiment (PR #48) drove the change:

- **Stateless replay changed what Ember saw.** Before a tool call, Ember writes a one-line preamble tagged `phase: "commentary"`. Flint's replay dropped the tag, so the preamble came back looking like a final answer to the seller.
- **That matched a failure seen only on tweaks.** In 12 of 41 tweaks, Ember said it was making the change and then stopped without calling a tool. Once, it looped on its own reasoning until it hit the 4,000-token cap, writing that it had "sent user message prematurely". This never happened on a first request.
- **Stored mode ran clean.** The same C2-sort sequence in stored mode, where Meta rebuilds the earlier turns itself with their tags, completed every step on the first attempt with the simplest edits.
- **Caching stayed low either way.** Stateless runs cached only the first ~3,000 tokens of each request, never the growing conversation, whether or not the cache key was sent.

## Considered Options

- **Stay stateless and keep the `phase` tag on replayed messages.** Rejected: it fixes the one known divergence but keeps Flint responsible for reproducing Ember's own history exactly, request after request.
- **Stay stateless, as the spec chose, so nothing is kept on Meta's side.** Rejected by the product owner after the experiment. The data is a seller's template and mock sample orders, never real orders.
- **A per-session or per-user cache key.** Rejected: Meta advises one stable key per shared prefix, and says unique keys per user or session lower hit rates.

## Consequences

- Meta keeps each response, including the template and sample orders in it. Meta doesn't document how long.
- Usage on a chained request counts only the new items, not the rebuilt history. Meta doesn't document how that history is billed, so the budget's worst-case estimate counts it as input.
- A response that has only just completed can briefly refuse to be chained from (HTTP 400). The client retries twice with a short backoff.
- For tweaks (#42), the browser holds the change's last response id instead of its input items, and the Worker stays stateless. A stored response that can no longer be chained from (expired or deleted) has to fall back to starting a new change.
- `include: ["reasoning.encrypted_content"]` is no longer sent. Meta refuses it alongside `previous_response_id`, and Ember keeps its reasoning server-side.
- The evidence is small: single short runs. The tweak-test harness defaults to stored mode, and `--responses-state=stateless` keeps the old shape for comparison.
