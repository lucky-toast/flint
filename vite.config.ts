import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The web app lives in src/web and builds to dist/client, which the Worker serves as static assets.
export default defineConfig({
  root: "src/web",
  plugins: [react()],
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
  },
  server: {
    // During `npm run dev`, forward API calls to a running `wrangler dev`.
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
});
