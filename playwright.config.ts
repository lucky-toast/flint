import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { appPort, appURL, fakeEmberPort, fakeEmberURL, inspectorPort } from "./test/e2e/support/ports";

// Browser tests run against `wrangler dev` serving the freshly built app, exactly as deployed,
// with the Worker pointed at a fake Ember (test/e2e/support/fake-ember-server.ts) so CI spends nothing.
// `--env e2e` (wrangler.jsonc) lifts the rate limits and loads .dev.vars.e2e, a placeholder key,
// instead of a developer's .dev.vars. Each run gets a fresh budget in its own state directory.
// Override E2E_PORT when several checkouts run browser tests at once.
// The config is evaluated in every worker process too; only the main process needs the state dir.
const stateDir = process.env.TEST_WORKER_INDEX === undefined ? mkdtempSync(join(tmpdir(), "flint-e2e-")) : "";
if (stateDir) {
  process.on("exit", () => {
    try {
      rmSync(stateDir, { recursive: true, force: true });
    } catch {
      // workerd may still hold files on Windows; the OS temp cleanup gets it eventually.
    }
  });
}

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
        "npm run build && npx wrangler dev --env e2e",
        `--ip 127.0.0.1 --port ${appPort} --inspector-port ${inspectorPort}`,
        `--persist-to "${stateDir}"`,
        `--var MODEL_API_BASE_URL:${fakeEmberURL}/v1`,
      ].join(" "),
      url: `${appURL}/api/status`,
      // Always start a fresh server so a stale build (or another checkout's server) is never tested.
      reuseExistingServer: false,
      timeout: 120_000,
      env: { WRANGLER_SEND_METRICS: "false" },
    },
  ],
});
