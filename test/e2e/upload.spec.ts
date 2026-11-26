import type { Page } from "@playwright/test";
import { uploadFollowUp } from "../../src/web/assets/asset-store";
import { assetCall, editCall, expect, replyCall, test } from "./support/ember";
import { editor } from "./support/editor";

// Named uploads: Flint asks for an image, the seller uploads and names it, and a follow-up turn
// lets Flint carry on. The image stays in this browser; turns carry only its name.

// A 1x1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const PNG_BASE64 = PNG.toString("base64");

const headerImage = (name: string) => ({
  find: '<img class="logo"',
  replace: `<img class="uploaded-${name}" src="{{ assets.${name} }}" alt=""><img class="logo"`,
});

function uploadForm(page: Page) {
  const form = page.getByRole("form", { name: "Upload an image" });
  return {
    form,
    file: form.getByLabel("Image", { exact: true }),
    name: form.getByLabel("Image name"),
    button: form.getByRole("button", { name: "Upload" }),
  };
}

test("Flint asks for a missing image, the seller uploads and names it, and Flint carries on to add it to the header", async ({
  page,
  ember,
}) => {
  await ember.onRequest("Add my eco-friendly badge to the header", assetCall("I need your eco-friendly badge image 🌱"));
  const followUp = await ember.onRequest(
    uploadFollowUp("eco_badge"),
    editCall([headerImage("eco_badge")], "Your eco-friendly badge is in the header 🌱"),
  );
  const ed = editor(page);
  await page.goto("/");

  await ed.send("Add my eco-friendly badge to the header");
  await expect(ed.flintSays("I need your eco-friendly badge image 🌱")).toBeVisible();

  const upload = uploadForm(page);
  await upload.file.setInputFiles({ name: "Eco Badge.png", mimeType: "image/png", buffer: PNG });
  await expect(upload.name).toHaveValue("eco_badge");
  await upload.button.click();

  await expect(ed.sellerSaid("supplied the eco_badge resource")).toBeVisible();
  await expect(ed.flintSays("Your eco-friendly badge is in the header 🌱")).toBeVisible();
  await expect(ed.working.locator("header img.uploaded-eco_badge")).toHaveAttribute("src", `data:image/png;base64,${PNG_BASE64}`);
  await expect(ed.original.locator("img.uploaded-eco_badge")).toHaveCount(0);

  // The follow-up is a new turn carrying the conversation and the uploaded name, never the image.
  const [call] = await followUp.calls();
  expect(call.instructions).toContain("assets.eco_badge");
  expect(call.input[0].content).toContain("Seller: Add my eco-friendly badge to the header\nFlint: I need your eco-friendly badge image 🌱");
  expect(JSON.stringify(call)).not.toContain(PNG_BASE64);
});

test("Try again on an edit that uses an uploaded image still offers that image to Flint", async ({ page, ember }) => {
  await ember.onRequest("Add my leaf logo beside the shop logo", assetCall("Please upload your leaf logo 🍃"));
  await ember.onRequest(uploadFollowUp("leaf_logo"), editCall([headerImage("leaf_logo")], "Your leaf logo is beside the shop logo 🍃"));
  // Longer than the follow-up's own match (the longest match wins), so it answers the retry.
  const retry = await ember.script(
    {
      match: `${uploadFollowUp("leaf_logo")}\n\nThe seller undid your last attempt at this request and wants a different approach. Last time: Your leaf logo is beside the shop logo 🍃`,
    },
    uploadFollowUp("leaf_logo"),
    editCall(
      [{ find: "</header>", replace: '<img class="leaf-after" src="{{ assets.leaf_logo }}" alt=""></header>' }],
      "Your leaf logo is at the end of the header now 🍃",
    ),
  );
  const ed = editor(page);
  await page.goto("/");

  await ed.send("Add my leaf logo beside the shop logo");
  const upload = uploadForm(page);
  await upload.file.setInputFiles({ name: "leaf logo.png", mimeType: "image/png", buffer: PNG });
  await upload.button.click();
  await expect(ed.working.locator("header img.uploaded-leaf_logo")).toHaveCount(1);

  await ed.tryAgainButton.click();

  await expect(ed.flintSays("Your leaf logo is at the end of the header now 🍃")).toBeVisible();
  await expect(ed.working.locator("header img.leaf-after")).toHaveAttribute("src", `data:image/png;base64,${PNG_BASE64}`);
  await expect(ed.working.locator("img.uploaded-leaf_logo")).toHaveCount(0);
  const [call] = await retry.calls();
  expect(call.instructions).toContain("assets.leaf_logo");
});

test("an uploaded image is kept across reloads for that shop only",async ({ page, ember }) => {
  await ember.onRequest("Add my kiln stamp image", assetCall("Please upload your kiln stamp 🔥"));
  await ember.onRequest(uploadFollowUp("kiln_stamp"), replyCall("Got your kiln stamp 🔥"));
  const later = await ember.onRequest(
    "Put my kiln stamp next to the logo",
    editCall([headerImage("kiln_stamp")], "Your kiln stamp is next to the logo 🔥"),
  );
  const ed = editor(page);
  await page.goto("/");
  // Another shop's upload in the same browser.
  await page.evaluate(
    (png) => localStorage.setItem("flint-assets:another-shop", JSON.stringify({ other_shop_badge: `data:image/png;base64,${png}` })),
    PNG_BASE64,
  );

  await ed.send("Add my kiln stamp image");
  const upload = uploadForm(page);
  await upload.file.setInputFiles({ name: "stamp.png", mimeType: "image/png", buffer: PNG });
  await upload.name.fill("kiln_stamp");
  await upload.button.click();
  await expect(ed.flintSays("Got your kiln stamp 🔥")).toBeVisible();

  await page.reload();
  await ed.send("Put my kiln stamp next to the logo");

  await expect(ed.flintSays("Your kiln stamp is next to the logo 🔥")).toBeVisible();
  await expect(ed.working.locator("header img.uploaded-kiln_stamp")).toHaveAttribute("src", `data:image/png;base64,${PNG_BASE64}`);
  const [call] = await later.calls();
  expect(call.instructions).toContain("assets.kiln_stamp");
  expect(call.instructions).not.toContain("other_shop_badge");
});

test("an oversized image shows a clear error and is not stored", async ({ page, ember }) => {
  await ember.onRequest("Add my giant banner image", assetCall("Please upload your banner 🖼️"));
  const later = await ember.onRequest("Is my giant banner saved", replyCall("Let's check 👀"));
  const ed = editor(page);
  await page.goto("/");

  await ed.send("Add my giant banner image");
  const upload = uploadForm(page);
  await upload.file.setInputFiles({ name: "giant_banner.png", mimeType: "image/png", buffer: Buffer.alloc(250 * 1024, 1) });
  await upload.button.click();

  await expect(upload.form.getByRole("alert")).toContainText("over the 200 KB limit");
  await expect(ed.sellerSaid("supplied the giant_banner resource")).toHaveCount(0);
  await expect(upload.button).toBeVisible();

  await page.reload();
  await ed.send("Is my giant banner saved");
  await expect(ed.flintSays("Let's check 👀")).toBeVisible();
  const [call] = await later.calls();
  expect(call.instructions).not.toContain("giant_banner");
});
