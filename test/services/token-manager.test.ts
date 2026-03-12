import { describe, expect, it, vi } from "vitest";
import { TokenManager } from "../../src/services/token-manager";

function createMockKV(store: Record<string, string> = {}) {
  return {
    get: vi.fn((key: string) => Promise.resolve(store[key] ?? null)),
    put: vi.fn((key: string, value: string) => {
      store[key] = value;
      return Promise.resolve();
    }),
  } as unknown as KVNamespace;
}

describe("TokenManager", () => {
  it("returns stored token when not expired", async () => {
    const futureMs = String(Date.now() + 3600_000);
    const kv = createMockKV({
      ticktick_access_token: "valid-token",
      ticktick_refresh_token: "refresh-tok",
      ticktick_token_expires_at: futureMs,
    });

    const tokenManager = new TokenManager(kv, "client-id", "client-secret");
    const token = await tokenManager.getValidToken();

    expect(token).toBe("valid-token");
  });

  it("refreshes token when expiring within 5 minutes", async () => {
    const soonMs = String(Date.now() + 2 * 60_000);
    const kv = createMockKV({
      ticktick_access_token: "old-token",
      ticktick_refresh_token: "refresh-tok",
      ticktick_token_expires_at: soonMs,
    });
    const tokenManager = new TokenManager(kv, "client-id", "client-secret");

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "new-token",
          token_type: "bearer",
          expires_in: 3600,
          refresh_token: "new-refresh",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    const token = await tokenManager.getValidToken();

    expect(token).toBe("new-token");
    expect(kv.put).toHaveBeenCalledWith("ticktick_access_token", "new-token");
    expect(kv.put).toHaveBeenCalledWith("ticktick_refresh_token", "new-refresh");

    vi.unstubAllGlobals();
  });

  it("throws when no tokens exist", async () => {
    const kv = createMockKV({});
    const tokenManager = new TokenManager(kv, "client-id", "client-secret");

    await expect(tokenManager.getValidToken()).rejects.toThrow(
      "TickTick not authorized",
    );
  });

  it("stores tokens from OAuth callback", async () => {
    const kv = createMockKV({});
    const tokenManager = new TokenManager(kv, "client-id", "client-secret");

    await tokenManager.storeTokens({
      access_token: "tok",
      refresh_token: "ref",
      expires_in: 3600,
    });

    expect(kv.put).toHaveBeenCalledWith("ticktick_access_token", "tok");
    expect(kv.put).toHaveBeenCalledWith("ticktick_refresh_token", "ref");
  });
});
