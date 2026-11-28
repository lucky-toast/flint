// Render static mockup HTML files to PNGs next to them, using the project's Playwright.
// Usage: node .claude/skills/mockup/scripts/render.mjs <file.html>... [--width 1440] [--height 900] [--full]
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  if (i === -1) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return Number(v);
};
const width = opt("--width", 1440);
const height = opt("--height", 900);
const full = args.includes("--full");
const files = args.filter((a) => a !== "--full");
if (files.length === 0) {
  console.error("Usage: render.mjs <file.html>... [--width N] [--height N] [--full]");
  process.exit(1);
}

const pw = join(process.cwd(), "node_modules", "playwright", "index.mjs");
const { chromium } = await import(pathToFileURL(pw).href);

// The project's Playwright may expect a Chromium build that isn't downloaded; fall back to any installed one.
function installedChrome() {
  const roots = [join(homedir(), "AppData", "Local", "ms-playwright"), join(homedir(), ".cache", "ms-playwright"), join(homedir(), "Library", "Caches", "ms-playwright")];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root).filter((d) => d.startsWith("chromium-")).sort().reverse()) {
      for (const sub of ["chrome-win64/chrome.exe", "chrome-win/chrome.exe", "chrome-linux/chrome", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"]) {
        const p = join(root, dir, sub);
        if (existsSync(p)) return p;
      }
    }
  }
}

let browser;
try {
  browser = await chromium.launch();
} catch {
  const executablePath = process.env.CHROME ?? installedChrome();
  if (!executablePath) throw new Error("No Chromium found. Set CHROME to a chrome executable.");
  browser = await chromium.launch({ executablePath });
}

const page = await browser.newPage({ viewport: { width, height } });
for (const file of files) {
  const abs = resolve(file);
  await page.setViewportSize({ width, height });
  await page.goto(pathToFileURL(abs).href, { waitUntil: "load" });
  // Iframes below the viewport don't paint in a full-page shot, so grow the viewport to the page first.
  if (full) {
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width, height: Math.max(height, h) });
  }
  await page.waitForTimeout(500);
  const out = abs.replace(/\.html?$/i, ".png");
  await page.screenshot({ path: out, fullPage: full });
  console.log(out);
}
await browser.close();
