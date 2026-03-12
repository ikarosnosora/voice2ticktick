import { describe, expect, it, vi } from "vitest";
import app from "../src/index";
import type { Env } from "../src/types";

function createEnv(kvOverrides?: Partial<KVNamespace>): Env {
  return {
    AUTH_KEY: "test-auth-key",
    TICKTICK_STORE: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      ...kvOverrides,
    } as unknown as KVNamespace,
    TICKTICK_CLIENT_ID: "cid",
    TICKTICK_SECRET: "secret",
    AI_PROVIDER: "anthropic",
    ANTHROPIC_API_KEY: "sk-test",
    ANTHROPIC_BASE_URL: "https://api.anthropic.com",
    ANTHROPIC_MODEL: "claude-haiku-4-5",
    AI: {} as Ai,
    WORKERS_AI_MODEL: "@cf/meta/llama-3.1-8b-instruct",
  };
}

describe("App entrypoint", () => {
  it("responds to GET /health", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  it("rejects POST /api/task without auth", async () => {
    const res = await app.request("/api/task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "test" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 503 for authorized POST /api/task when TickTick tokens are missing", async () => {
    const env = createEnv();
    const res = await app.request(
      "/api/task",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Auth-Key": env.AUTH_KEY,
        },
        body: JSON.stringify({ text: "test" }),
      },
      env,
    );

    expect(res.status).toBe(503);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toContain("/auth/login");
  });

  it("rejects POST /api/projects without auth", async () => {
    const res = await app.request("/api/projects", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("rejects GET /auth/login without auth", async () => {
    const res = await app.request("/auth/login");
    expect(res.status).toBe(401);
  });
});
