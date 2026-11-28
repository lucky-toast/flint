// Shared by tweak-test.mjs and review.mjs: Flint's own code, bundled from src/ so the experiment
// sends exactly what the app sends (instructions, tools, user message, retry wording) and checks
// edits exactly as the app does (applyEdits, validateTemplate). Same approach as scripts/review.mjs.

import { build } from "esbuild";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const HERE = fileURLToPath(new URL(".", import.meta.url));
export const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Loads MODEL_API_KEY (and optional MODEL_API_BASE_URL) from tweak-test/.env, else limit-test/.env. */
export function loadEnv() {
  for (const file of [join(HERE, ".env"), join(ROOT, "limit-test", ".env")]) {
    if (existsSync(file)) {
      process.loadEnvFile(file);
      return file;
    }
  }
  return null;
}

export async function loadFlint() {
  const dir = mkdtempSync(join(tmpdir(), "flint-tweak-test-"));
  const outfile = join(dir, "flint.mjs");
  try {
    await build({
      stdin: {
        contents: `export {
  buildInstructions, buildUserMessage, TOOLS, requestBody, promptCacheKey, replayItems, firstFunctionCall, messageText,
  applyEdits, validateTemplate, editRejection, NO_TOOL_NUDGE, TEXT_ON_RETRY_NUDGE, MAX_ATTEMPTS, MAX_OUTPUT_TOKENS,
  EMBER_MODEL, DEFAULT_EMBER_BASE_URL, renderSlip, previewDocument, PAPER_SIZES, costNanoUsd, NANO_USD_PER_USD,
} from "./src/core";
export { shops, builtInTemplates } from "./src/data";`,
        resolveDir: ROOT,
        loader: "ts",
      },
      bundle: true,
      platform: "node",
      format: "esm",
      outfile,
      // Bundled CommonJS dependencies (LiquidJS) still require Node built-ins.
      banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
      logLevel: "error",
    });
    return await import(pathToFileURL(outfile).href);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
