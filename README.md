# Flint

Sellers edit their packing-slip templates by chatting with Flint, a helper powered by Meta's Muse Ember. Flint makes small, validated edits to Liquid templates. Spec: [docs/flint-spec.md](docs/flint-spec.md).

## Local setup

Requires Node 22.18 or later.

```sh
npm install
cp .dev.vars.example .dev.vars   # then fill in the keys below
npm start                        # builds the app and runs the Worker at http://localhost:8787
```

`.dev.vars` is git-ignored. Set:

| Key | Value |
|---|---|
| `EMBER_API_KEY` | Your Meta Muse Ember API key |
| `ACCESS_CODE` | Any string; entering it in the app unlocks live mode |
| `MODEL_API_BASE_URL` | Optional; points the Worker at another Responses API endpoint |

Restart `npm start` after editing `.dev.vars`.

## Live and replay

- **Replay** (default, no code): the header shows a Replay badge. On Kiln & Co., chips play recorded responses for the demo requests. Replay spends nothing.
- **Live**: click "Have an access code?" in the header and enter your `ACCESS_CODE`. The badge switches to Live, and requests go to Muse Ember (capped at $3 in total by `TOKEN_BUDGET_USD` in `wrangler.jsonc`).

## Hot reload

Keep `npm start` running for the API, then run `npm run dev` in a second terminal and open the URL Vite prints (usually http://localhost:5173).

## Tests

```sh
npm test            # Worker tests (Vitest, Workers runtime, fake Ember)
npm run test:e2e    # Browser tests (Playwright against wrangler dev, fake Ember)
npm run typecheck
```

If Playwright can't find its browser under `\ms-playwright\…`, your shell has no `LOCALAPPDATA`. Set `PLAYWRIGHT_BROWSERS_PATH` to `%USERPROFILE%\AppData\Local\ms-playwright` first.

## Production

Set secrets with `npx wrangler secret put EMBER_API_KEY` and `npx wrangler secret put ACCESS_CODE`. Use a long, random access code. Set `LIVE_MODE` to anything other than `on` to turn live mode off.
