import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { authMiddleware } from "../../src/middleware/auth";
import type { Env } from "../../src/types";

function createApp(authKey: string) {
  const app = new Hono<{ Bindings: Env }>();
  app.use("/api/*", authMiddleware);
  app.get("/api/test", (c) => c.json({ ok: true }));
  app.get("/health", (c) => c.json({ ok: true }));
  return {
    app,
    env: {
      AUTH_KEY: authKey,
    } as Env,
  };
}

describe("authMiddleware", () => {
  const authKey = "test-secret-key-12345";

  it("passes with valid X-Auth-Key", async () => {
    const { app, env } = createApp(authKey);
    const res = await app.request(
      "/api/test",
      {
        headers: { "X-Auth-Key": authKey },
      },
      env,
    );
    expect(res.status).toBe(200);
  });

  it("returns 401 with missing X-Auth-Key", async () => {
    const { app, env } = createApp(authKey);
    const res = await app.request("/api/test", undefined, env);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 with wrong X-Auth-Key", async () => {
    const { app, env } = createApp(authKey);
    const res = await app.request(
      "/api/test",
      {
        headers: { "X-Auth-Key": "wrong-key" },
      },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 with empty X-Auth-Key", async () => {
    const { app, env } = createApp(authKey);
    const res = await app.request(
      "/api/test",
      {
        headers: { "X-Auth-Key": "" },
      },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("does not apply to non /api/* routes", async () => {
    const { app, env } = createApp(authKey);
    const res = await app.request("/health", undefined, env);
    expect(res.status).toBe(200);
  });
});
