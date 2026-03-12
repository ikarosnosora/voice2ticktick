import { beforeEach, describe, expect, it, vi } from "vitest";
import { TickTickClient } from "../../src/services/ticktick";

function createMockKV(store: Record<string, string> = {}) {
  return {
    get: vi.fn((key: string) => Promise.resolve(store[key] ?? null)),
    put: vi.fn((key: string, value: string) => {
      store[key] = value;
      return Promise.resolve();
    }),
  } as unknown as KVNamespace;
}

describe("TickTickClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  describe("createTask", () => {
    it("sends correct POST request to TickTick API", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: "task-123", title: "Test" }), {
          status: 200,
        }),
      );
      vi.stubGlobal("fetch", mockFetch);

      const client = new TickTickClient("bearer-token");
      const result = await client.createTask({
        title: "Test task",
        priority: 3,
        dueDate: "2026-03-12T15:00:00+0800",
        timeZone: "Asia/Singapore",
      });

      expect(result.id).toBe("task-123");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://ticktick.com/open/v1/task",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer bearer-token",
            "Content-Type": "application/json",
          }),
        }),
      );
    });

    it("maps isAllDay boolean to string", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: "t1", title: "T" }), { status: 200 }),
      );
      vi.stubGlobal("fetch", mockFetch);

      const client = new TickTickClient("tok");
      await client.createTask({ title: "All day", priority: 0, isAllDay: true });

      const body = JSON.parse(
        mockFetch.mock.calls[0][1].body as string,
      ) as Record<string, string>;
      expect(body.isAllDay).toBe("true");
    });

    it("throws on API error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response("Forbidden", { status: 403 })),
      );

      const client = new TickTickClient("bad-token");
      await expect(client.createTask({ title: "T", priority: 0 })).rejects.toThrow(
        "TickTick API error",
      );
    });
  });

  describe("getProjects", () => {
    it("returns cached projects when fresh", async () => {
      const kv = createMockKV({
        project_list: JSON.stringify([{ id: "p1", name: "Work" }]),
        project_list_updated_at: String(Date.now()),
      });

      const client = new TickTickClient("tok");
      const projects = await client.getProjects(kv);
      expect(projects).toEqual([{ id: "p1", name: "Work" }]);
    });

    it("fetches fresh projects when cache is stale", async () => {
      const staleTime = String(Date.now() - 25 * 60 * 60 * 1000);
      const kv = createMockKV({
        project_list: JSON.stringify([]),
        project_list_updated_at: staleTime,
      });

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

      const client = new TickTickClient("tok");
      const projects = await client.getProjects(kv);
      expect(projects).toHaveLength(2);
      expect(kv.put).toHaveBeenCalledWith("project_list", expect.any(String));
    });

    it("refreshes when cached project data has an invalid shape", async () => {
      const kv = createMockKV({
        project_list: JSON.stringify([{ id: "p1", name: 123 }]),
        project_list_updated_at: String(Date.now()),
      });

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify([{ id: "p1", name: "Work" }]), {
          status: 200,
        }),
      );
      vi.stubGlobal("fetch", mockFetch);

      const client = new TickTickClient("tok");
      const projects = await client.getProjects(kv);

      expect(projects).toEqual([{ id: "p1", name: "Work" }]);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("returns a 502 error when project fetch is not ok", async () => {
      const kv = createMockKV();

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response("Forbidden", { status: 401 })),
      );

      const client = new TickTickClient("tok");
      await expect(client.getProjects(kv, true)).rejects.toMatchObject({
        message: "Failed to fetch projects: 401",
        status: 502,
      });
    });

    it("rejects malformed JSON project responses", async () => {
      const kv = createMockKV();

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response("<html>nope</html>", { status: 200 })),
      );

      const client = new TickTickClient("tok");
      await expect(client.getProjects(kv, true)).rejects.toMatchObject({
        message: "Invalid TickTick project response",
        status: 502,
      });
      expect(kv.put).not.toHaveBeenCalled();
    });

    it("rejects invalid project response shapes", async () => {
      const kv = createMockKV();

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify([{ id: "p1", name: 123 }]), { status: 200 }),
        ),
      );

      const client = new TickTickClient("tok");
      await expect(client.getProjects(kv, true)).rejects.toMatchObject({
        message: "Invalid TickTick project response",
        status: 502,
      });
      expect(kv.put).not.toHaveBeenCalled();
    });

    it("resolves projectName to projectId case-insensitively", () => {
      const client = new TickTickClient("tok");
      const projects = [
        { id: "p1", name: "Work" },
        { id: "p2", name: "生活" },
      ];

      expect(client.resolveProjectId("work", projects)).toBe("p1");
      expect(client.resolveProjectId("生活", projects)).toBe("p2");
      expect(client.resolveProjectId("nonexistent", projects)).toBeUndefined();
    });
  });
});
