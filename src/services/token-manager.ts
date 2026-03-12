const TOKEN_URL = "https://ticktick.com/oauth/token";
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
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
    if (Date.now() < expiresAtMs - REFRESH_THRESHOLD_MS) {
      return accessToken;
    }

    if (!refreshToken) {
      const err = new Error("TickTick not authorized. Visit /auth/login");
      (err as Error & { status?: number }).status = 503;
      throw err;
    }

    return this.refreshAccessToken(refreshToken);
  }

  async storeTokens(data: {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }): Promise<void> {
    const expiresAt = String(Date.now() + data.expires_in * 1000);

    await Promise.all([
      this.kv.put("ticktick_access_token", data.access_token),
      data.refresh_token
        ? this.kv.put("ticktick_refresh_token", data.refresh_token)
        : Promise.resolve(),
      this.kv.put("ticktick_token_expires_at", expiresAt),
    ]);
  }

  private async refreshAccessToken(refreshToken: string): Promise<string> {
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

    const data = (await res.json()) as TokenResponse;
    await this.storeTokens(data);
    return data.access_token;
  }
}
