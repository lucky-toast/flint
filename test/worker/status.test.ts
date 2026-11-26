import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import worker from "../../src/worker";

/** GET /api/status against the Worker with some env values overridden (e.g. the kill switch). */
async function statusWith(overrides: Partial<Env>) {
  const res = await worker.fetch(new Request("http://flint.test/api/status"), { ...env, ...overrides });
  return res.json();
}

describe("GET /api/status", () => {
  it("reports whether live mode is on and how much budget remains", async () => {
    const res = await exports.default.fetch("http://flint.test/api/status");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ live: true, budgetRemainingPct: 100 });
  });

  it("reports live off when the kill switch is off", async () => {
    expect(await statusWith({ LIVE_MODE: "off" })).toMatchObject({ live: false });
  });

  it("reports live off when no Ember key is configured", async () => {
    expect(await statusWith({ EMBER_API_KEY: "" })).toMatchObject({ live: false });
  });

  it("answers unknown API routes with a JSON 404", async () => {
    const res = await exports.default.fetch("http://flint.test/api/nope");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});
