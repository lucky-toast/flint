import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Worker tests run inside the real Workers runtime (Miniflare), configured from wrangler.jsonc.
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
  test: {
    include: ["test/worker/**/*.test.ts"],
  },
});
