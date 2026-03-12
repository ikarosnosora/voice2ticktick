import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { healthRoute } from "../../src/routes/health";

describe("GET /health", () => {
  it("returns 200 with ok status", async () => {
    const app = new Hono();
    app.route("/", healthRoute);

    const res = await app.request("/health");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });
});
