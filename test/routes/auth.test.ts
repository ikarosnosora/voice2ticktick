import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authRoutes } from "../../src/routes/auth";
import type { Env } from "../../src/types";

function createApp() {
  const mockKV = {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };

  const app = new Hono<{ Bindings: Env }>();
  app.route("/", authRoutes);

  return {
    app,
    mockKV,
    env: {
      TICKTICK_STORE: mockKV,
      TICKTICK_CLIENT_ID: "test-client-id",
      TICKTICK_SECRET: "test-secret",
      AUTH_KEY: "my-auth-key",
    } as unknown as Env,
  };
}

describe("GET /auth/login", () => {
  it("redirects to TickTick OAuth authorize URL with state", async () => {
    const { app, env } = createApp();
    const res = await app.request("/auth/login", undefined, env);

    expect(res.status).toBe(302);
    const location = res.headers.get("Location") ?? "";
    expect(location).toContain("ticktick.com/oauth/authorize");
    expect(location).toContain("client_id=test-client-id");
    expect(location).toContain("state=");
  });

  it("encodes the state signature as base64url", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("nonce-1");

    const { app, env } = createApp();
    const res = await app.request("/auth/login", undefined, env);
    const location = res.headers.get("Location") ?? "";
    const stateParam = new URL(location).searchParams.get("state") ?? "";
    const signature = stateParam.split(".").at(-1) ?? "";

    expect(signature).not.toMatch(/[+/=]/u);
  });
});

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("rejects callback with missing state", async () => {
    const { app, env } = createApp();
    const res = await app.request("/auth/callback?code=abc", undefined, env);
    expect(res.status).toBe(400);
  });

  it("rejects callback with invalid HMAC state", async () => {
    const { app, env } = createApp();
    const res = await app.request(
      "/auth/callback?code=abc&state=invalid-state",
      undefined,
      env,
    );
    expect(res.status).toBe(403);
  });

  it("rejects expired callback state", async () => {
    vi.spyOn(Date, "now")
      .mockReturnValueOnce(1_700_000_000_000)
      .mockReturnValueOnce(1_700_000_660_000);

    const { app, env } = createApp();
    const loginRes = await app.request("/auth/login", undefined, env);
    const location = loginRes.headers.get("Location") ?? "";
    const stateParam = new URL(location).searchParams.get("state") ?? "";

    const res = await app.request(
      `/auth/callback?code=abc&state=${encodeURIComponent(stateParam)}`,
      undefined,
      env,
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("State expired");
  });

  it("exchanges code for tokens on valid callback", async () => {
    const { app, env, mockKV } = createApp();
    const loginRes = await app.request("/auth/login", undefined, env);
    const location = loginRes.headers.get("Location") ?? "";
    const stateParam = new URL(location).searchParams.get("state") ?? "";

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_in: 3600,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    const res = await app.request(
      `/auth/callback?code=authcode123&state=${encodeURIComponent(stateParam)}`,
      undefined,
      env,
    );

    expect(res.status).toBe(200);
    expect(mockKV.put).toHaveBeenCalledWith("ticktick_access_token", "new-access");
  });

  it("rejects invalid token payloads from TickTick", async () => {
    const { app, env, mockKV } = createApp();
    const loginRes = await app.request("/auth/login", undefined, env);
    const location = loginRes.headers.get("Location") ?? "";
    const stateParam = new URL(location).searchParams.get("state") ?? "";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: "new-access",
            expires_in: "not-a-number",
          }),
          { status: 200 },
        ),
      ),
    );

    const res = await app.request(
      `/auth/callback?code=authcode123&state=${encodeURIComponent(stateParam)}`,
      undefined,
      env,
    );

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid TickTick token response");
    expect(mockKV.put).not.toHaveBeenCalled();
  });
});
