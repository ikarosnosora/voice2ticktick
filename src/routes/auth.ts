import { Hono } from "hono";
import { TokenManager } from "../services/token-manager";
import type { Env } from "../types";

const AUTHORIZE_URL = "https://ticktick.com/oauth/authorize";
const TOKEN_URL = "https://ticktick.com/oauth/token";
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

export const authRoutes = new Hono<{ Bindings: Env }>();

function toBase64Url(data: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(data)))
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/u, "");
}

async function hmacSign(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return toBase64Url(signature);
}

async function hmacVerify(
  data: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const expected = await hmacSign(data, secret);
  const encoder = new TextEncoder();
  const [expectedHash, actualHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
    crypto.subtle.digest("SHA-256", encoder.encode(signature)),
  ]);

  return crypto.subtle.timingSafeEqual(expectedHash, actualHash);
}

function buildStatePayload(nonce: string, timestamp: number): string {
  return `${nonce}.${timestamp}`;
}

authRoutes.get("/auth/login", async (c) => {
  const nonce = crypto.randomUUID();
  const timestamp = Date.now();
  const payload = buildStatePayload(nonce, timestamp);
  const signature = await hmacSign(payload, c.env.AUTH_KEY);
  const state = `${payload}.${signature}`;
  const redirectUri = new URL("/auth/callback", c.req.url).toString();

  const params = new URLSearchParams({
    client_id: c.env.TICKTICK_CLIENT_ID,
    scope: "tasks:read tasks:write",
    redirect_uri: redirectUri,
    response_type: "code",
    state,
  });

  return c.redirect(`${AUTHORIZE_URL}?${params.toString()}`);
});

authRoutes.get("/auth/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");

  if (!code || !state) {
    return c.json({ success: false, error: "Missing code or state" }, 400);
  }

  const parts = state.split(".");
  if (parts.length < 3) {
    return c.json({ success: false, error: "Invalid state" }, 403);
  }

  const signature = parts.pop() as string;
  const payload = parts.join(".");
  const valid = await hmacVerify(payload, signature, c.env.AUTH_KEY);

  if (!valid) {
    return c.json({ success: false, error: "Invalid state signature" }, 403);
  }

  const timestamp = Number(parts[1]);
  if (Number.isNaN(timestamp) || Date.now() - timestamp > STATE_MAX_AGE_MS) {
    return c.json({ success: false, error: "State expired" }, 403);
  }

  const redirectUri = new URL("/auth/callback", c.req.url).toString();
  const basicAuth = btoa(`${c.env.TICKTICK_CLIENT_ID}:${c.env.TICKTICK_SECRET}`);
  let tokenRes: Response;
  try {
    tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        scope: "tasks:read tasks:write",
        redirect_uri: redirectUri,
      }),
    });
  } catch {
    return c.json({ success: false, error: "Token exchange request failed" }, 502);
  }

  if (!tokenRes.ok) {
    return c.json(
      { success: false, error: "Failed to exchange code for tokens" },
      502,
    );
  }

  let tokenData: unknown;
  try {
    tokenData = await tokenRes.json();
  } catch {
    return c.json({ success: false, error: "Invalid TickTick token response" }, 502);
  }

  const tokenManager = new TokenManager(
    c.env.TICKTICK_STORE,
    c.env.TICKTICK_CLIENT_ID,
    c.env.TICKTICK_SECRET,
  );
  try {
    await tokenManager.storeTokens(tokenData);
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    if (status === 502) {
      return c.json({ success: false, error: (error as Error).message }, 502);
    }

    console.error("Unexpected error storing tokens", {
      message: (error as Error).message,
      error,
    });
    throw error;
  }

  await Promise.all([
    c.env.TICKTICK_STORE.delete("project_list"),
    c.env.TICKTICK_STORE.delete("project_list_updated_at"),
  ]);

  return c.html("<h1>Authorization successful!</h1><p>You can close this page.</p>");
});
