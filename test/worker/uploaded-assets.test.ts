import { afterEach, describe, expect, it, vi } from "vitest";
import { classic, postTurn } from "./client";
import { editCall, fakeEmber, toolCall } from "./fake-ember";

// Seller-uploaded images stay in the browser; the turn only carries their names, and the Worker
// validates edits against placeholder images under those names.

const BADGE_FIND = '<img class="logo"';
const BADGE_REPLACE = '<img class="eco-badge" src="{{ assets.eco_badge }}" alt=""><img class="logo"';
const badgeEdit = () => editCall([{ find: BADGE_FIND, replace: BADGE_REPLACE }], "Your eco badge is in the header 🌱");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/turn, uploaded assets", () => {
  it("accepts an edit that references an uploaded asset", async () => {
    const calls = fakeEmber(badgeEdit());

    const res = await postTurn({
      message: "I've uploaded the image as eco_badge. Please carry on with my request.",
      uploadedAssets: ["eco_badge"],
    });

    expect(await res.json()).toEqual({
      type: "edit",
      templateSource: classic.replace(BADGE_FIND, BADGE_REPLACE),
      summary: "Your eco badge is in the header 🌱",
    });
    expect(calls).toHaveLength(1);
  });

  it("lists uploaded asset names beside the shop's own in the system prompt", async () => {
    const calls = fakeEmber(badgeEdit());

    await postTurn({ message: "Add my eco-friendly badge", uploadedAssets: ["eco_badge"] });

    expect(calls[0]!.body.instructions).toContain("assets.logo");
    expect(calls[0]!.body.instructions).toContain("assets.eco_badge");
  });

  it("still rejects an asset that is neither the shop's nor uploaded", async () => {
    const calls = fakeEmber(badgeEdit(), toolCall("request_asset", { description: "Your eco-friendly badge 🌱" }));

    const res = await postTurn({ message: "Add my eco-friendly badge", uploadedAssets: ["stamp"] });

    expect(await res.json()).toEqual({ type: "asset", description: "Your eco-friendly badge 🌱" });
    expect(calls).toHaveLength(2);
  });

  it.each([
    ["not an array", "eco_badge"],
    ["a non-string name", [42]],
    ["a name that isn't a plain identifier", ["eco badge"]],
    ["too many names", Array.from({ length: 21 }, (_, i) => `img_${i}`)],
  ])("refuses uploadedAssets that is %s", async (_label, uploadedAssets) => {
    const res = await postTurn({ message: "Add my eco-friendly badge", uploadedAssets });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "bad_request" });
  });
});
