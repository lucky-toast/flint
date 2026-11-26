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

## Turn logs

`npm start` logs every turn and Ember call to `logs/<timestamp>/` (`calls.jsonl` with the raw requests and responses, `runs.jsonl` per turn), in the limit test's format. `npm run review` turns the latest folder into `review.html` with diffs and before/after slips. Logging is off in production.

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

Flint deploys as one Worker on the Custom Domain in `wrangler.jsonc` (`routes`). The domain's zone must be on the Cloudflare account wrangler is logged into (`npx wrangler whoami`), and the hostname must not already have a DNS record: Cloudflare creates the record and certificate on the first deploy.

First deploy:

```sh
npx wrangler login               # if whoami shows no account
npx wrangler secret put EMBER_API_KEY
npx wrangler secret put ACCESS_CODE
npm run deploy                   # build, then wrangler deploy to the top-level (production) environment
```

`secret put` creates the Worker if it doesn't exist yet. Use a long, random access code. Secrets persist across deploys, so later deploys are just `npm run deploy`.

Check it:

- Open the public URL without a code: Replay badge, all three shops load, replay chips play on Kiln & Co.
- `https://<hostname>/api/status` reports live state and remaining budget.
- Enter the access code: the badge switches to Live and a request goes through.

Kill switch: set `LIVE_MODE` in `wrangler.jsonc` to `off` and run `npm run deploy` (or edit the variable under Workers & Pages > flint > Settings > Variables and secrets in the dashboard, which takes effect immediately but is overwritten by the next deploy). `/api/status` should then report `"live": false`, and with the code entered a new request gets the resting reply instead of reaching Muse Ember (replay chips still play). Set it back to `on` and deploy again to restore live mode.
