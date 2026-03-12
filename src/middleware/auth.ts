import type { MiddlewareHandler } from "hono";
import type { Env } from "../types";

async function sha256(data: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  return crypto.subtle.digest("SHA-256", encoder.encode(data));
}

export const authMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (
  c,
  next,
) => {
  const provided = c.req.header("X-Auth-Key");
  if (!provided) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  const [expectedHash, providedHash] = await Promise.all([
    sha256(c.env.AUTH_KEY),
    sha256(provided),
  ]);

  if (!crypto.subtle.timingSafeEqual(expectedHash, providedHash)) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  await next();
};
