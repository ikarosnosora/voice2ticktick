import { beforeEach, describe, expect, it, vi } from "vitest";
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
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

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

  it("deduplicates concurrent refreshes across manager instances", async () => {
    const soonMs = String(Date.now() + 2 * 60_000);
    const sharedStore = {
      ticktick_access_token: "old-token",
      ticktick_refresh_token: "refresh-tok",
      ticktick_token_expires_at: soonMs,
    };
    const firstManager = new TokenManager(
      createMockKV(sharedStore),
      "client-id",
      "client-secret",
    );
    const secondManager = new TokenManager(
      createMockKV(sharedStore),
      "client-id",
      "client-secret",
    );

    const mockFetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          setTimeout(() => {
            resolve(
              new Response(
                JSON.stringify({
                  access_token: "new-token",
                  expires_in: 3600,
                  refresh_token: "new-refresh",
                }),
                { status: 200 },
              ),
            );
          }, 10);
        }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const [firstToken, secondToken] = await Promise.all([
      firstManager.getValidToken(),
      secondManager.getValidToken(),
    ]);

    expect(firstToken).toBe("new-token");
    expect(secondToken).toBe("new-token");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed JSON during token refresh", async () => {
    const soonMs = String(Date.now() + 2 * 60_000);
    const kv = createMockKV({
      ticktick_access_token: "old-token",
      ticktick_refresh_token: "refresh-tok",
      ticktick_token_expires_at: soonMs,
    });
    const tokenManager = new TokenManager(kv, "client-id", "client-secret");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>nope</html>", { status: 200 })),
    );

    await expect(tokenManager.getValidToken()).rejects.toMatchObject({
      message: "Invalid TickTick token response",
      status: 502,
    });
    expect(kv.put).not.toHaveBeenCalled();
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

  it("accepts numeric string expires_in values", async () => {
    const kv = createMockKV({});
    const tokenManager = new TokenManager(kv, "client-id", "client-secret");

    await tokenManager.storeTokens({
      access_token: "tok",
      refresh_token: "ref",
      expires_in: "3600",
    });

    expect(kv.put).toHaveBeenCalledWith("ticktick_access_token", "tok");
    expect(kv.put).toHaveBeenCalledWith("ticktick_refresh_token", "ref");
    expect(kv.put).toHaveBeenCalledWith(
      "ticktick_token_expires_at",
      expect.any(String),
    );
  });

  it("rejects invalid expires_in values", async () => {
    const kv = createMockKV({});
    const tokenManager = new TokenManager(kv, "client-id", "client-secret");

    await expect(
      tokenManager.storeTokens({
        access_token: "tok",
        expires_in: "not-a-number",
      }),
    ).rejects.toThrow("Invalid TickTick token response");
  });
});
