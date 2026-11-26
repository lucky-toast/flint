import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { placeholderAssets, renderSlip, uploadFollowUp, type TurnResult } from "../../src/core";
import { findReplay, REPLAY_CHIPS, shops } from "../../src/data";
import worker from "../../src/worker";
import { GLOBAL_BUDGET } from "../../src/worker/budget";
import { ACCESS_CODE_NOTE, REPLAY_DOESNT_FIT, REPLAY_OTHER_SHOP } from "../../src/worker/replay";
import { classic, postTurn, randomIp, turnHeaders, type TurnOptions } from "./client";
import { fakeEmber, toolCall } from "./fake-ember";

// Access code and replay mode: without a valid code, /api/turn answers the scripted demo requests
// from recordings and everything else with a note about the access code.

const kiln = shops.find((s) => s.id === "kiln-and-co")!;
const order = (number: string) => kiln.orders.find((o) => o.number === number)!;
const RESTING = { type: "error", error: "resting" };

const [SORT, GLAZE, PROMO, GIFT_PRICES, GIFT_MESSAGE, ECO_BADGE, NICER, BIGGER_LOGO] = REPLAY_CHIPS as [
  string, string, string, string, string, string, string, string,
];

type Turn = { message: string; templateSource?: string; uploadedAssets?: string[]; shopId?: string };

async function turn({ message, templateSource = classic, ...rest }: Turn, options: TurnOptions = { accessCode: null }) {
  const res = await postTurn({ message, templateSource, ...rest }, options);
  expect(res.status).toBe(200);
  return (await res.json()) as TurnResult;
}

/** A replayed turn that must come back as an accepted edit; returns the new template. */
async function replayedEdit(message: string, templateSource: string, uploadedAssets?: string[]) {
  const result = await turn({ message, templateSource, uploadedAssets });
  if (result.type !== "edit") throw new Error(`expected an edit for "${message}", got ${JSON.stringify(result)}`);
  return result.templateSource;
}

const render = (source: string, number: string) =>
  renderSlip(source, kiln, order(number), { ...kiln.assets, ...placeholderAssets(["eco_badge"]) });

const skus = (html: string) => [...html.matchAll(/<td class="col-sku">([^<]*)<\/td>/g)].map((m) => m[1]!.trim()).filter(Boolean);
const count = (html: string, text: string) => html.split(text).length - 1;

async function budgetSpent() {
  const { spentNanoUsd, reservedNanoUsd } = await env.BUDGET.getByName(GLOBAL_BUDGET).snapshot();
  return spentNanoUsd + reservedNanoUsd;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/turn, access code", () => {
  it("runs live with a valid access code", async () => {
    const calls = fakeEmber(toolCall("reply", { message: "Live and well 👋" }));

    expect(await turn({ message: SORT }, {})).toEqual({ type: "reply", message: "Live and well 👋" });
    expect(calls).toHaveLength(1);
  });

  it("replays a scripted request without calling Ember when there's no access code", async () => {
    const calls = fakeEmber();

    expect(await turn({ message: SORT })).toMatchObject({
      type: "edit",
      summary: "Sorted line items by quantity (highest first), then SKU.",
    });
    expect(calls).toHaveLength(0);
  });

  it("replays with a wrong access code", async () => {
    const calls = fakeEmber();

    expect(await turn({ message: SORT }, { accessCode: "not-the-code" })).toMatchObject({ type: "edit" });
    expect(calls).toHaveLength(0);
  });

  it("answers free text without an access code with the access-code note", async () => {
    const calls = fakeEmber();

    expect(await turn({ message: "Add a QR code to the footer" })).toEqual({ type: "reply", message: ACCESS_CODE_NOTE });
    expect(calls).toHaveLength(0);
  });

  it("matches replay requests loosely, ignoring case, spacing and punctuation", async () => {
    expect(await turn({ message: "  sort the items by QUANTITY (highest first) then by sku! " })).toMatchObject({ type: "edit" });
  });

  it("spends no budget in replay mode", async () => {
    const before = await budgetSpent();

    for (const message of REPLAY_CHIPS) await turn({ message });
    await turn({ message: "Something unscripted" });

    expect(await budgetSpent()).toBe(before);
  });

  it("reports whether the access code is valid in the status", async () => {
    const status = async (options: TurnOptions) =>
      (await worker.fetch(new Request("http://flint.test/api/status", { headers: turnHeaders(options) }), env)).json();

    expect(await status({})).toMatchObject({ access: true });
    expect(await status({ accessCode: "wrong" })).toMatchObject({ access: false });
    expect(await status({ accessCode: null })).toMatchObject({ access: false });
  });

  it("stops accepting codes from an IP after 20 code checks in a minute, even the right one", async () => {
    const status = async (options: TurnOptions) =>
      (await worker.fetch(new Request("http://flint.test/api/status", { headers: turnHeaders(options) }), env)).json();
    const ip = randomIp();

    for (let i = 0; i < 20; i++) expect(await status({ ip, accessCode: `guess-${i}` })).toMatchObject({ access: false });

    expect(await status({ ip })).toMatchObject({ access: false });
    expect(await turn({ message: "Add a QR code" }, { ip })).toEqual({ type: "reply", message: ACCESS_CODE_NOTE });
    expect(await status({ ip: randomIp() })).toMatchObject({ access: true });
  });

  it("gives nobody live access when no access code is configured", async () => {
    const calls = fakeEmber();
    const init = {
      method: "POST",
      headers: turnHeaders({ accessCode: "" }),
      body: JSON.stringify({ shopId: "kiln-and-co", templateSource: classic, history: [], message: "Add a QR code" }),
    };

    const res = await worker.fetch(new Request("http://flint.test/api/turn", init), { ...env, ACCESS_CODE: "" });

    expect(await res.json()).toEqual({ type: "reply", message: ACCESS_CODE_NOTE });
    expect(calls).toHaveLength(0);
  });
});

describe("POST /api/turn, resting falls back to replay", () => {
  const withKillSwitchOff = async (message: string) => {
    const init = {
      method: "POST",
      headers: turnHeaders(),
      body: JSON.stringify({ shopId: "kiln-and-co", templateSource: classic, history: [], message }),
    };
    return (await worker.fetch(new Request("http://flint.test/api/turn", init), { ...env, LIVE_MODE: "off" })).json();
  };

  it("replays a scripted request when live mode is off, even with the access code", async () => {
    const calls = fakeEmber();

    expect(await withKillSwitchOff(BIGGER_LOGO)).toMatchObject({ type: "edit" });
    expect(await withKillSwitchOff("Add a QR code")).toEqual(RESTING);
    expect(calls).toHaveLength(0);
  });

  it("replays a scripted request when Ember fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network down"));

    expect(await turn({ message: BIGGER_LOGO }, {})).toMatchObject({ type: "edit" });
    expect(await turn({ message: "Add a QR code" }, {})).toEqual(RESTING);
  });
});

describe("replay recordings", () => {
  it("plays the whole demo in order on Classic, each step validated against every Kiln & Co. order", async () => {
    // 1. Sort by quantity (highest first), then SKU.
    let source = await replayedEdit(SORT, classic);
    expect(skus(await render(source, "1003"))).toEqual([
      "MUG-12-TNM",
      "BWL-RMN-TNM",
      "PLT-DIN-CEL",
      "PLT-SID-CEL",
      "BWL-SRV-SPK",
      "PLN-MIN-SHN",
      "VAS-BUD-SPK",
    ]);

    // 2. One table per glaze, keeping the sort inside each.
    source = await replayedEdit(GLAZE, source);
    let html = await render(source, "1003");
    expect([...html.matchAll(/<h3 class="glaze-heading">([^<]*)<\/h3>/g)].map((m) => m[1])).toEqual([
      "Tenmoku",
      "Celadon",
      "Speckled",
      "Shino",
    ]);
    expect(count(html, '<table class="items">')).toBe(4);
    expect(skus(html)).toHaveLength(7);

    // 3. The promo line, once, on orders over $200 only.
    source = await replayedEdit(PROMO, source);
    expect(count(await render(source, "1004"), "Free mystery mini planter")).toBe(1);
    expect(count(await render(source, "1003"), "Free mystery mini planter")).toBe(1);
    expect(count(await render(source, "1001"), "Free mystery mini planter")).toBe(0);

    // 4. No prices or totals on gift orders.
    source = await replayedEdit(GIFT_PRICES, source);
    html = await render(source, "1002");
    expect(html).not.toContain('class="col-price"');
    expect(html).not.toContain('class="totals"');
    expect(html).not.toContain("$");
    expect(await render(source, "1001")).toContain('class="totals"');

    // 5. The gift message stands out, on gift orders only.
    source = await replayedEdit(GIFT_MESSAGE, source);
    expect(source).toContain("background: #fbeee6");
    expect(await render(source, "1002")).toContain("Happy birthday, Mira!");
    expect(await render(source, "1001")).not.toContain('class="gift-message"');

    // 6. The eco badge: Flint asks for the image, then places the uploaded one under the shop name.
    expect(await turn({ message: ECO_BADGE, templateSource: source })).toEqual({
      type: "asset",
      description: "Your new eco-friendly badge image to place under the shop name",
    });
    source = await replayedEdit(uploadFollowUp("eco_badge"), source, ["eco_badge"]);
    expect(await render(source, "1001")).toMatch(/<div class="brand">\s*<img class="logo"[^>]*>\s*<img class="eco-badge" src="data:image/);

    // 7. "Make it look nicer" asks, with chips that replay too.
    const ask = await turn({ message: NICER, templateSource: source });
    expect(ask).toMatchObject({ type: "ask", options: expect.arrayContaining(["Bigger logo"]) });
    for (const option of (ask as { options: string[] }).options) expect(findReplay(option)).toBeDefined();

    // 8. The "Bigger logo" chip.
    source = await replayedEdit("Bigger logo", source, ["eco_badge"]);
    expect(source).toContain(".logo { height: 112px; }");
  });

  it("has a recording for each of the eight scripted requests that fits plain Classic", async () => {
    expect(REPLAY_CHIPS).toHaveLength(8);
    for (const message of REPLAY_CHIPS) {
      const result = await turn({ message });
      expect(result.type, message).not.toBe("error");
      expect(result, message).not.toEqual({ type: "reply", message: REPLAY_DOESNT_FIT });
    }
    expect(await turn({ message: uploadFollowUp("my_badge"), uploadedAssets: ["my_badge"] })).toMatchObject({ type: "edit" });
  });

  it("puts the promo line in the single items table when the glaze tables come later", async () => {
    let source = await replayedEdit(PROMO, classic);
    expect(count(await render(source, "1004"), "Free mystery mini planter")).toBe(1);
    source = await replayedEdit(GIFT_PRICES, source);
    expect(await render(source, "1002")).not.toContain("$");
  });

  it("says a step doesn't fit when its recorded edit no longer applies", async () => {
    const sorted = await replayedEdit(SORT, classic);

    expect(await turn({ message: SORT, templateSource: sorted })).toEqual({ type: "reply", message: REPLAY_DOESNT_FIT });
  });

  it("points other shops at Kiln & Co.", async () => {
    expect(await turn({ message: SORT, shopId: "second-stitch" })).toEqual({ type: "reply", message: REPLAY_OTHER_SHOP });
  });
});
