import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { projectsRoute } from "../../src/routes/projects";
import type { Env } from "../../src/types";

describe("POST /api/projects", () => {
  it("returns refreshed project list", async () => {
    const mockKV = {
      get: vi
        .fn()
        .mockResolvedValueOnce("valid-token")
        .mockResolvedValueOnce("refresh-tok")
        .mockResolvedValueOnce(String(Date.now() + 3600_000)),
      put: vi.fn().mockResolvedValue(undefined),
    };

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          { id: "p1", name: "Work" },
          { id: "p2", name: "Life" },
        ]),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    const app = new Hono<{ Bindings: Env }>();
    app.route("/", projectsRoute);

    const res = await app.request(
      "/api/projects",
      { method: "POST" },
      {
        TICKTICK_STORE: mockKV as never,
        TICKTICK_CLIENT_ID: "cid",
        TICKTICK_SECRET: "csec",
      } as unknown as Env,
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      success: boolean;
      projects: Array<{ id: string; name: string }>;
    };
    expect(body.success).toBe(true);
    expect(body.projects).toHaveLength(2);

    vi.unstubAllGlobals();
  });
});
