import { describe, expect, it } from "vitest";
import app from "../src/index";

describe("App entrypoint", () => {
  it("responds to GET /health", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  it("rejects POST /api/task without auth", async () => {
    const res = await app.request("/api/task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "test" }),
    });

    expect(res.status).toBe(401);
  });

  it("rejects POST /api/projects without auth", async () => {
    const res = await app.request("/api/projects", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("rejects GET /auth/login without auth", async () => {
    const res = await app.request("/auth/login");
    expect(res.status).toBe(401);
  });
});
