const TOKEN_URL = "https://ticktick.com/oauth/token";
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;
const refreshRequests = new Map<string, Promise<string>>();

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

function invalidTokenResponseError(): Error & { status: number } {
  return Object.assign(new Error("Invalid TickTick token response"), {
    status: 502,
  });
}

function normalizeTokenResponse(data: unknown): TokenResponse {
  if (!data || typeof data !== "object") {
    throw invalidTokenResponseError();
  }

  const {
    access_token: accessToken,
    expires_in: expiresInValue,
    refresh_token: refreshToken,
  } = data as Record<string, unknown>;

  if (typeof accessToken !== "string" || accessToken.length === 0) {
    throw invalidTokenResponseError();
  }

  if (refreshToken !== undefined && typeof refreshToken !== "string") {
    throw invalidTokenResponseError();
  }

  const expiresIn =
    typeof expiresInValue === "string" ? Number(expiresInValue) : expiresInValue;
  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw invalidTokenResponseError();
  }

  return {
    access_token: accessToken,
    expires_in: expiresIn,
    refresh_token: refreshToken,
  };
}

export class TokenManager {
  constructor(
    private readonly kv: KVNamespace,
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  async getValidToken(): Promise<string> {
    const [accessToken, refreshToken, expiresAt] = await Promise.all([
      this.kv.get("ticktick_access_token"),
      this.kv.get("ticktick_refresh_token"),
      this.kv.get("ticktick_token_expires_at"),
    ]);

    if (!accessToken) {
      const err = new Error("TickTick not authorized. Visit /auth/login");
      (err as Error & { status?: number }).status = 503;
      throw err;
    }

    const expiresAtMs = Number(expiresAt ?? 0);
    if (
      Number.isFinite(expiresAtMs) &&
      Date.now() < expiresAtMs - REFRESH_THRESHOLD_MS
    ) {
      return accessToken;
    }

    if (!refreshToken) {
      const err = new Error("TickTick not authorized. Visit /auth/login");
      (err as Error & { status?: number }).status = 503;
      throw err;
    }

    return this.refreshAccessToken(refreshToken);
  }

  async storeTokens(data: unknown): Promise<TokenResponse> {
    const tokenData = normalizeTokenResponse(data);
    const expiresAt = String(Date.now() + tokenData.expires_in * 1000);

    await Promise.all([
      this.kv.put("ticktick_access_token", tokenData.access_token),
      tokenData.refresh_token
        ? this.kv.put("ticktick_refresh_token", tokenData.refresh_token)
        : Promise.resolve(),
      this.kv.put("ticktick_token_expires_at", expiresAt),
    ]);

    return tokenData;
  }

  private async refreshAccessToken(refreshToken: string): Promise<string> {
    const refreshKey = `${this.clientId}:${refreshToken}`;
    const inFlightRefresh = refreshRequests.get(refreshKey);
    if (inFlightRefresh) {
      return inFlightRefresh;
    }

    const refreshPromise = this.performTokenRefresh(refreshToken).finally(() => {
      refreshRequests.delete(refreshKey);
    });

    refreshRequests.set(refreshKey, refreshPromise);
    return refreshPromise;
  }

  private async performTokenRefresh(refreshToken: string): Promise<string> {
    const basicAuth = btoa(`${this.clientId}:${this.clientSecret}`);
    let res: Response;
    try {
      res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basicAuth}`,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      });
    } catch {
      const err = new Error("Token refresh request failed");
      (err as Error & { status?: number }).status = 502;
      throw err;
    }

    if (!res.ok) {
      const err = new Error("Failed to refresh TickTick token");
      (err as Error & { status?: number }).status = 502;
      throw err;
    }

    const tokenData = await this.storeTokens(await res.json());
    return tokenData.access_token;
  }
}
