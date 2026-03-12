import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../src/types";

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

import { generateObject } from "ai";
import { taskRoute } from "../../src/routes/task";

function createApp() {
  const mockKV = {
    get: vi.fn().mockImplementation((key: string) => {
      const store: Record<string, string> = {
        ticktick_access_token: "valid-token",
        ticktick_refresh_token: "ref-tok",
        ticktick_token_expires_at: String(Date.now() + 3600_000),
        project_list: JSON.stringify([
          { id: "p1", name: "Work" },
          { id: "p2", name: "生活" },
        ]),
        project_list_updated_at: String(Date.now()),
      };

      return Promise.resolve(store[key] ?? null);
    }),
    put: vi.fn().mockResolvedValue(undefined),
  };

  const app = new Hono<{ Bindings: Env }>();
  app.route("/", taskRoute);
  return {
    app,
    env: {
      TICKTICK_STORE: mockKV,
      TICKTICK_CLIENT_ID: "cid",
      TICKTICK_SECRET: "csec",
      AI_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "sk-test",
      ANTHROPIC_BASE_URL: "https://api.anthropic.com",
      ANTHROPIC_MODEL: "claude-haiku-4-5",
    } as unknown as Env,
  };
}

describe("POST /api/task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns 400 for missing text", async () => {
    const { app, env } = createApp();
    const res = await app.request(
      "/api/task",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      env,
    );

    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed JSON", async () => {
    const { app, env } = createApp();
    const res = await app.request(
      "/api/task",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{invalid",
      },
      env,
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Invalid JSON");
  });

  it("returns 400 for invalid timezone", async () => {
    const { app, env } = createApp();
    const res = await app.request(
      "/api/task",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "开会", timezone: "Mars/Olympus" }),
      },
      env,
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("timezone");
  });

  it("creates a single task successfully", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        tasks: [
          {
            title: "开会",
            dueDate: "2026-03-13T15:00:00+0800",
            priority: 3,
            projectName: "Work",
          },
        ],
      },
    } as Awaited<ReturnType<typeof generateObject>>);

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ id: "t1", title: "开会", projectId: "p1" }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    const { app, env } = createApp();
    const res = await app.request(
      "/api/task",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "明天三点开会 重要 放到work",
          timezone: "Asia/Singapore",
        }),
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      summary: string;
      tasks: Array<{ id: string }>;
    };
    expect(body.success).toBe(true);
    expect(body.tasks).toHaveLength(1);
    expect(body.summary).toContain("开会");
  });

  it("creates multiple tasks and reports partial failure", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        tasks: [
          { title: "开会", priority: 0 },
          { title: "买牛奶", priority: 0 },
        ],
      },
    } as Awaited<ReturnType<typeof generateObject>>);

    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        return new Response(JSON.stringify({ id: "t1", title: "开会" }), {
          status: 200,
        });
      }

      return new Response("Error", { status: 500 });
    });
    vi.stubGlobal("fetch", mockFetch);

    const { app, env } = createApp();
    const res = await app.request(
      "/api/task",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "明天开会 后天买牛奶" }),
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      tasks: unknown[];
      failed: unknown[];
    };
    expect(body.success).toBe(true);
    expect(body.tasks).toHaveLength(1);
    expect(body.failed).toHaveLength(1);
  });

  it("returns 502 when LLM fails", async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error("LLM timeout"));

    const { app, env } = createApp();
    const res = await app.request(
      "/api/task",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "开会" }),
      },
      env,
    );

    expect(res.status).toBe(502);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toContain("parse");
  });

  it("returns 502 when LLM returns no tasks", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        tasks: [],
      },
    } as Awaited<ReturnType<typeof generateObject>>);

    const { app, env } = createApp();
    const res = await app.request(
      "/api/task",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "开会" }),
      },
      env,
    );

    expect(res.status).toBe(502);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toContain("parse");
  });
});
