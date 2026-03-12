import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { errorHandler } from "../../src/middleware/error-handler";

function createApp() {
  const app = new Hono();
  app.onError(errorHandler);
  app.get("/throw-generic", () => {
    throw new Error("something broke");
  });
  app.get("/throw-with-status", () => {
    const err = new Error("not found") as Error & { status?: number };
    err.status = 404;
    throw err;
  });
  return app;
}

describe("errorHandler", () => {
  it("catches thrown errors and returns JSON", async () => {
    const app = createApp();
    const res = await app.request("/throw-generic");
    expect(res.status).toBe(500);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toBe("something broke");
  });

  it("respects custom status codes on errors", async () => {
    const app = createApp();
    const res = await app.request("/throw-with-status");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toBe("not found");
  });
});
