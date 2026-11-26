// Secrets aren't in wrangler.jsonc, so `wrangler types` doesn't see them; declare them here.
// Locally they come from .dev.vars (see .dev.vars.example); in production from `wrangler secret put`.
interface FlintSecrets {
  /** Muse Ember API key. Live mode needs it. */
  EMBER_API_KEY?: string;
  /** Access code that unlocks live mode (used from the access-code ticket on). */
  ACCESS_CODE?: string;
}

interface Env extends FlintSecrets {}
declare namespace Cloudflare {
  interface Env extends FlintSecrets {}
}
