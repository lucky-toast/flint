import { expect, test } from "@playwright/test";

const preview = 'iframe[title="Slip preview"]';

test("opening the app shows Kiln & Co.'s Classic slip for its default order", async ({ page }) => {
  await page.goto("/");

  const slip = page.frameLocator(preview);
  await expect(slip.getByText("Order #1003")).toBeVisible();
  await expect(slip.getByText("Hannah Lindqvist").first()).toBeVisible();
  await expect(slip.getByRole("cell", { name: /Serving Bowl/ })).toBeVisible();

  // The logo is a data URI, which the preview policy allows, so it actually loads.
  const logo = slip.locator("img.logo");
  await expect(logo).toBeVisible();
  await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
});

test("the preview is sandboxed with scripts disabled and a content security policy", async ({ page }) => {
  await page.goto("/");
  const frame = page.locator(preview);

  const sandbox = await frame.getAttribute("sandbox");
  expect(sandbox).not.toBeNull();
  expect(sandbox).not.toContain("allow-scripts");

  const csp = await page.frameLocator(preview).locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  for (const directive of [
    "default-src 'none'",
    "img-src data:",
    "script-src 'none'",
    "connect-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ]) {
    expect(csp).toContain(directive);
  }
});

test("the sandbox refuses a script injected into the template", async ({ page }) => {
  // Requests the browser actually completed to anywhere but the app itself (CSP-blocked ones fail instead).
  const outbound: string[] = [];
  page.on("requestfinished", (req) => {
    if (new URL(req.url()).host !== new URL(page.url()).host && !req.url().startsWith("data:")) outbound.push(req.url());
  });

  await page.goto("/");
  await expect(page.frameLocator(preview).getByText("Order #1003")).toBeVisible();
  const titleBefore = await page.title();

  // Splice hostile markup into the rendered slip, as a hijacked template edit would produce.
  // The app's own iframe (its sandbox and its CSP) must neutralize all of it.
  const hostile = [
    `<script>document.body.setAttribute("data-pwned", "script"); parent.document.title = "pwned";</script>`,
    `<img src="data:," onerror="document.body.setAttribute('data-pwned', 'handler')">`,
    `<img id="leak" src="https://example.com/leak.png?order=1003">`,
  ].join("");
  await page.locator(preview).evaluate((iframe: HTMLIFrameElement, markup) => {
    iframe.srcdoc = iframe.srcdoc.replace("</body>", `${markup}</body>`);
  }, hostile);

  const slip = page.frameLocator(preview);
  await expect(slip.locator("#leak")).toBeAttached();
  await expect(slip.getByText("Order #1003")).toBeVisible();
  // Give any script, handler or request a moment to run if it were going to.
  await page.waitForTimeout(500);

  await expect(slip.locator("body")).not.toHaveAttribute("data-pwned");
  expect(await page.title()).toBe(titleBefore);
  expect(await slip.locator("#leak").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(0);
  expect(outbound).toEqual([]);
});
