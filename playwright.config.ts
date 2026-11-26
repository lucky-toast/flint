import { defineConfig, devices } from "@playwright/test";

// Override with E2E_PORT when several checkouts run browser tests at once.
const port = Number(process.env.E2E_PORT ?? 8788);
const baseURL = `http://127.0.0.1:${port}`;

// Browser tests run against `wrangler dev` serving the freshly built app, exactly as deployed.
export default defineConfig({
  testDir: "test/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npx wrangler dev --ip 127.0.0.1 --port ${port} --inspector-port ${port + 1000}`,
    url: `${baseURL}/api/status`,
    // Always start a fresh server so a stale build (or another checkout's server) is never tested.
    reuseExistingServer: false,
    timeout: 120_000,
    env: { WRANGLER_SEND_METRICS: "false" },
  },
});
