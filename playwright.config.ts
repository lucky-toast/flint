import { defineConfig, devices } from "@playwright/test";
import { appPort, appURL, fakeEmberPort, fakeEmberURL, inspectorPort } from "./test/e2e/support/ports";

// Browser tests run against `wrangler dev` serving the freshly built app, exactly as deployed,
// with the Worker pointed at a fake Ember (test/e2e/support/fake-ember-server.ts) so CI spends nothing.
// Override E2E_PORT when several checkouts run browser tests at once.
export default defineConfig({
  testDir: "test/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: appURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `node test/e2e/support/fake-ember-server.ts ${fakeEmberPort}`,
      url: `${fakeEmberURL}/health`,
      reuseExistingServer: false,
      stdout: "pipe",
    },
    {
      command: [
        "npm run build && npx wrangler dev",
        `--ip 127.0.0.1 --port ${appPort} --inspector-port ${inspectorPort}`,
        `--var MODEL_API_BASE_URL:${fakeEmberURL}/v1`,
        // A placeholder key turns live mode on; it only ever reaches the fake.
        "--var EMBER_API_KEY:fake-ember-key",
        "--var LIVE_MODE:on",
      ].join(" "),
      url: `${appURL}/api/status`,
      // Always start a fresh server so a stale build (or another checkout's server) is never tested.
      reuseExistingServer: false,
      timeout: 120_000,
      env: { WRANGLER_SEND_METRICS: "false" },
    },
  ],
});
