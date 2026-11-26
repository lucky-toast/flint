import { appURL } from "./ports";

// The browser tests' access code. It matches ACCESS_CODE in .dev.vars.e2e, a placeholder that only
// the e2e Worker accepts. Every test starts with it stored (playwright.config.ts), so turns run live
// against the fake Ember; replay tests start without it.

export const E2E_ACCESS_CODE = "e2e-access-code";

/** Must match STORAGE_KEY in src/web/access/access-code.ts. */
const ACCESS_CODE_KEY = "flint-access-code";

/** Storage with the access code saved, as a judge's browser would have it. */
export const withAccessCode = {
  cookies: [],
  origins: [{ origin: appURL, localStorage: [{ name: ACCESS_CODE_KEY, value: E2E_ACCESS_CODE }] }],
};

/** A visitor's browser: no access code. */
export const withoutAccessCode = { cookies: [], origins: [] };
