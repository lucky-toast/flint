import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("GET /api/status", () => {
  it("reports whether live mode is on and how much budget remains", async () => {
    const res = await exports.default.fetch("http://flint.test/api/status");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ live: true, budgetRemainingPct: 100 });
  });

  it("answers unknown API routes with a JSON 404", async () => {
    const res = await exports.default.fetch("http://flint.test/api/nope");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});
