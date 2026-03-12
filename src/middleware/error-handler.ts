import type { ErrorHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export const errorHandler: ErrorHandler = (err, c) => {
  const status = (err as Error & { status?: number }).status ?? 500;
  return c.json(
    { success: false, error: err.message },
    status as ContentfulStatusCode,
  );
};
