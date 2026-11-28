// Checks look at slips the way a seller sees them: each rendered order is loaded into headless
// Chromium (Playwright, already a dev dependency for the e2e tests) inside Flint's own preview
// document, at the template's paper width. Checks then read only what the page shows: visible text
// (CSS-hidden content doesn't count), element boxes (size, position, order), and visible tables.
// Nothing reads the Liquid source.

import { chromium } from "@playwright/test";

const PX_PER_UNIT = { in: 96, mm: 96 / 25.4 };
const toPx = (len) => {
  const [, n, unit] = len.match(/^([\d.]+)(in|mm)$/);
  return Math.round(Number(n) * PX_PER_UNIT[unit]);
};

export async function openBrowser(flint) {
  // CHROMIUM_PATH points at a Chromium you already have, when Playwright's own build isn't installed.
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const contexts = new Map(); // paper -> context
  const views = new Map(); // cache key -> View

  async function contextFor(paper) {
    if (!contexts.has(paper)) {
      const size = flint.PAPER_SIZES[paper];
      // The preview's CSP (meta tag) would also block Playwright's own page scripts, so it is
      // bypassed and its one job that matters here, no network, is enforced by refusing every request.
      const context = await browser.newContext({
        viewport: { width: toPx(size.width), height: toPx(size.height) },
        bypassCSP: true,
        javaScriptEnabled: true,
      });
      await context.route("**/*", (route) => route.abort());
      contexts.set(paper, context);
    }
    return contexts.get(paper);
  }

  /** A loaded slip for one order. `assets` maps asset names to the data URLs used in the render. */
  async function view(html, paper, assets, key = null) {
    const k = key ?? `${paper}\n${html}`;
    if (views.has(k)) return views.get(k);
    const page = await (await contextFor(paper)).newPage();
    await page.setContent(flint.previewDocument(html, paper), { waitUntil: "load" });
    const v = new View(page, assets);
    views.set(k, v);
    return v;
  }

  /** Closes every cached view except those whose key starts with one of `keep`. */
  async function release(keep = []) {
    for (const [k, v] of views) {
      if (keep.some((p) => k.startsWith(p))) continue;
      views.delete(k);
      await v.page.close();
    }
  }

  return { view, release, close: () => browser.close() };
}

// Runs in the page. Shared helpers are passed as source so every evaluate sees the same rules.
const PAGE_HELPERS = `
  const norm = (s) => (s ?? "").replace(/\\s+/g, " ").trim();
  const visible = (el) => {
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
  // The deepest visible elements whose visible text contains s, in document order.
  const deepest = (s) => {
    const want = norm(s);
    const hits = [...document.body.querySelectorAll("*")].filter((el) => visible(el) && norm(el.innerText).includes(want));
    return hits.filter((el) => !hits.some((o) => o !== el && el.contains(o)));
  };
`;

class View {
  constructor(page, assets) {
    this.page = page;
    this.assets = assets;
  }

  #run(body, arg) {
    return this.page.evaluate(new Function("arg", `${PAGE_HELPERS}\n${body}`), arg);
  }

  /** The slip's visible text, whitespace collapsed. */
  text() {
    return this.#run(`return norm(document.body.innerText);`);
  }

  async has(s) {
    return (await this.text()).includes(s.replace(/\s+/g, " ").trim());
  }

  /** Box of the first deepest visible element showing `s`, or null. */
  async box(s) {
    return (await this.boxes(s))[0] ?? null;
  }

  /** Boxes of every deepest visible element showing `s`. */
  boxes(s) {
    return this.#run(`return deepest(arg).map(rect);`, s);
  }

  /**
   * The line `s` is on: the nearest block-level element around the first place it shows, with its
   * visible text and box, or null.
   */
  lineWith(s) {
    return this.#run(
      `let el = deepest(arg)[0];
       if (!el) return null;
       while (el.parentElement && el !== document.body && getComputedStyle(el).display.startsWith("inline")) el = el.parentElement;
       return { text: norm(el.innerText), rect: rect(el) };`,
      s,
    );
  }

  /** Visible text whose box lies vertically within [top, bottom), in reading order. */
  textIn(top, bottom) {
    return this.#run(
      `const out = [];
       const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
       for (let n = walk.nextNode(); n; n = walk.nextNode()) {
         if (!norm(n.data) || !n.parentElement || !visible(n.parentElement)) continue;
         if (n.parentElement.closest("style")) continue;
         const range = document.createRange();
         range.selectNodeContents(n);
         const r = range.getBoundingClientRect();
         if (r.height > 0 && r.top >= arg.top && r.bottom <= arg.bottom) out.push(norm(n.data));
       }
       return out.join(" ");`,
      { top, bottom },
    );
  }

  /** Box of the visible image showing asset `name`, or null. */
  img(name) {
    return this.#run(
      `const img = [...document.images].find((i) => i.getAttribute("src") === arg && visible(i));
       return img ? rect(img) : null;`,
      this.assets[name],
    );
  }

  /** Visible tables, top to bottom: their box, and each row's visible cells (text and box). */
  tables() {
    return this.#run(`
      return [...document.querySelectorAll("table")].filter(visible).map((t) => ({
        rect: rect(t),
        rows: [...t.rows].filter(visible).map((r) => ({
          header: [...r.cells].every((c) => c.tagName === "TH"),
          cells: [...r.cells].filter(visible).map((c) => ({ text: norm(c.innerText), rect: rect(c) })),
        })),
      }));`);
  }

  /**
   * The given strings sorted by where they first appear on the slip (top to bottom, then left to
   * right). Strings that aren't visible are left out.
   */
  async order(strings) {
    const found = [];
    for (const s of strings) {
      const b = await this.box(s);
      if (b) found.push([s, b]);
    }
    return found.sort((a, b) => a[1].y - b[1].y || a[1].x - b[1].x).map(([s]) => s);
  }
}
