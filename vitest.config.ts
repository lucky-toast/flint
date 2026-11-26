import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Worker tests run inside the real Workers runtime (Miniflare), configured from wrangler.jsonc.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      // Test secrets live here so tests never depend on a local .dev.vars. Ember itself is faked.
      miniflare: { bindings: { EMBER_API_KEY: "test-ember-key", ACCESS_CODE: "test-access-code" } },
    }),
  ],
  test: {
    include: ["test/worker/**/*.test.ts"],
  },
});
