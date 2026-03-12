# voice2ticktick Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Cloudflare Worker that converts voice text into TickTick tasks via LLM parsing.

**Architecture:** Hono-based Worker with middleware (auth, error handling), service layer (AI provider, TickTick client, token manager), and Zod-validated schemas. The LLM parses voice text into structured task data; the server maps project names to IDs and creates tasks via TickTick Open API.

**Tech Stack:** TypeScript, Cloudflare Workers, Hono, Zod, Vercel AI SDK (`ai`, `@ai-sdk/anthropic`, `workers-ai-provider`), Vitest + `@cloudflare/vitest-pool-workers`

**Spec:** `docs/superpowers/specs/2026-03-12-voice2ticktick-design.md`

---

## Chunk 1: Project Scaffolding & Schemas

### Task 1: Initialize project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `wrangler.toml`
- Create: `.dev.vars.example`
- Create: `.gitignore`
- Create: `vitest.config.ts`

- [ ] **Step 1: Initialize pnpm project and install dependencies**

```bash
cd /Users/dongyu/Downloads/voice2ticktick
pnpm init
pnpm add hono zod ai @ai-sdk/anthropic workers-ai-provider
pnpm add -D wrangler @cloudflare/workers-types @cloudflare/vitest-pool-workers vitest typescript
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext"],
    "types": ["@cloudflare/workers-types/2023-07-01", "@cloudflare/vitest-pool-workers"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "esModuleInterop": true,
    "forceConsistentCasingInImports": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "jsxImportSource": "hono/jsx"
  },
  "include": ["src/**/*.ts", "test/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create wrangler.toml**

```toml
name = "voice2ticktick"
main = "src/index.ts"
compatibility_date = "2024-09-23"

[vars]
AI_PROVIDER = "anthropic"
ANTHROPIC_MODEL = "claude-haiku-4-5"
WORKERS_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct"

[[kv_namespaces]]
binding = "TICKTICK_STORE"
id = "placeholder-replace-with-real-id"

[ai]
binding = "AI"
```

- [ ] **Step 4: Create .dev.vars.example**

```
ANTHROPIC_API_KEY=sk-ant-your-key-here
ANTHROPIC_BASE_URL=https://api.anthropic.com
TICKTICK_CLIENT_ID=your-client-id
TICKTICK_SECRET=your-client-secret
AUTH_KEY=your-secret-auth-key
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
.dev.vars
.wrangler/
*.log
.DS_Store
```

- [ ] **Step 6: Create vitest.config.ts**

```typescript
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
      },
    },
  },
});
```

- [ ] **Step 7: Add scripts to package.json**

Add to `package.json`:
```json
{
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 8: Commit**

```bash
cd /path/to/source-repo
git worktree add /Users/dongyu/Downloads/voice2ticktick -b codex/voice2ticktick
cd /Users/dongyu/Downloads/voice2ticktick
git add package.json pnpm-lock.yaml tsconfig.json wrangler.toml vitest.config.ts .dev.vars.example .gitignore
git commit -m "chore: scaffold project with wrangler, hono, vitest"
```

If `/Users/dongyu/Downloads/voice2ticktick` is already a Git worktree, skip the `git worktree add` command. Do not run `git init` inside this directory.

---

### Task 2: Types & Env interface

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create Env interface**

```typescript
// src/types.ts

export interface Env {
  // AI Provider
  AI_PROVIDER: string;
  ANTHROPIC_API_KEY: string;
  ANTHROPIC_BASE_URL: string;
  ANTHROPIC_MODEL: string;

  // Workers AI (optional)
  AI: Ai;
  WORKERS_AI_MODEL: string;

  // TickTick
  TICKTICK_CLIENT_ID: string;
  TICKTICK_SECRET: string;

  // Auth
  AUTH_KEY: string;

  // Storage
  TICKTICK_STORE: KVNamespace;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: add Env interface with all bindings"
```

---

### Task 3: Zod schemas

**Files:**
- Create: `src/schemas/task.ts`
- Create: `test/schemas/task.test.ts`

- [ ] **Step 1: Write failing schema tests**

```typescript
// test/schemas/task.test.ts
import { describe, it, expect } from "vitest";
import { RequestSchema, TaskArraySchema, ResponseSchema } from "../../src/schemas/task";

describe("RequestSchema", () => {
  it("accepts valid request with text and timezone", () => {
    const result = RequestSchema.safeParse({ text: "明天开会", timezone: "Asia/Singapore" });
    expect(result.success).toBe(true);
  });

  it("defaults timezone to Asia/Singapore", () => {
    const result = RequestSchema.parse({ text: "明天开会" });
    expect(result.timezone).toBe("Asia/Singapore");
  });

  it("rejects empty text", () => {
    const result = RequestSchema.safeParse({ text: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing text", () => {
    const result = RequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects invalid timezone", () => {
    const result = RequestSchema.safeParse({ text: "明天开会", timezone: "Mars/Olympus" });
    expect(result.success).toBe(false);
  });
});

describe("TaskArraySchema", () => {
  it("accepts valid single task", () => {
    const result = TaskArraySchema.safeParse({
      tasks: [{ title: "开会", priority: 0 }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts full task with all fields", () => {
    const result = TaskArraySchema.safeParse({
      tasks: [{
        title: "Review design",
        content: "PBA benchmark",
        startDate: "2026-03-12T15:00:00+0800",
        dueDate: "2026-03-12T17:00:00+0800",
        isAllDay: false,
        priority: 3,
        projectName: "工作",
        tags: ["review"],
      }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts multiple tasks up to 5", () => {
    const tasks = Array.from({ length: 5 }, (_, i) => ({
      title: `Task ${i + 1}`,
      priority: 0 as const,
    }));
    const result = TaskArraySchema.safeParse({ tasks });
    expect(result.success).toBe(true);
  });

  it("rejects empty task array", () => {
    const result = TaskArraySchema.safeParse({ tasks: [] });
    expect(result.success).toBe(false);
  });

  it("rejects more than 5 tasks", () => {
    const tasks = Array.from({ length: 6 }, (_, i) => ({
      title: `Task ${i + 1}`,
      priority: 0 as const,
    }));
    const result = TaskArraySchema.safeParse({ tasks });
    expect(result.success).toBe(false);
  });

  it("rejects empty title", () => {
    const result = TaskArraySchema.safeParse({
      tasks: [{ title: "", priority: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid priority value", () => {
    const result = TaskArraySchema.safeParse({
      tasks: [{ title: "Test", priority: 2 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid date format", () => {
    const result = TaskArraySchema.safeParse({
      tasks: [{ title: "Test", priority: 0, dueDate: "2026-03-12" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid date format", () => {
    const result = TaskArraySchema.safeParse({
      tasks: [{ title: "Test", priority: 0, dueDate: "2026-03-12T15:00:00+0800" }],
    });
    expect(result.success).toBe(true);
  });
});

describe("ResponseSchema", () => {
  it("accepts success response", () => {
    const result = ResponseSchema.safeParse({
      success: true,
      summary: "已创建: 开会",
      tasks: [{ id: "abc", title: "开会" }],
      failed: [],
    });
    expect(result.success).toBe(true);
  });

  it("accepts error response", () => {
    const result = ResponseSchema.safeParse({
      success: false,
      error: "Unauthorized",
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- test/schemas/task.test.ts
```

Expected: FAIL — module `../../src/schemas/task` not found.

- [ ] **Step 3: Implement schemas**

```typescript
// src/schemas/task.ts
import { z } from "zod";

const dateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{4}$/;
const DEFAULT_TIMEZONE = "Asia/Singapore";

function isValidTimeZone(value: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export const RequestSchema = z.object({
  text: z.string().trim().min(1),
  timezone: z.string().default(DEFAULT_TIMEZONE).refine(isValidTimeZone, {
    message: "Invalid timezone",
  }),
});

export type TaskRequest = z.infer<typeof RequestSchema>;

const LLMTaskSchema = z.object({
  title: z.string().min(1),
  content: z.string().optional(),
  startDate: z.string().regex(dateTimeRegex).optional(),
  dueDate: z.string().regex(dateTimeRegex).optional(),
  isAllDay: z.boolean().optional(),
  priority: z.union([z.literal(0), z.literal(1), z.literal(3), z.literal(5)]),
  projectName: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const TaskArraySchema = z.object({
  tasks: z.array(LLMTaskSchema).min(1).max(5),
});

export type LLMTask = z.infer<typeof LLMTaskSchema>;
export type LLMOutput = z.infer<typeof TaskArraySchema>;

export const ResponseSchema = z.union([
  z.object({
    success: z.literal(true),
    summary: z.string(),
    tasks: z.array(z.object({ id: z.string(), title: z.string() }).passthrough()),
    failed: z.array(z.object({ title: z.string(), error: z.string() })),
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
  }),
]);

export type TaskResponse = z.infer<typeof ResponseSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- test/schemas/task.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/schemas/task.ts test/schemas/task.test.ts
git commit -m "feat: add Zod schemas for request, LLM output, response"
```

---

## Chunk 2: Middleware

### Task 4: Auth middleware

**Files:**
- Create: `src/middleware/auth.ts`
- Create: `test/middleware/auth.test.ts`

- [ ] **Step 1: Write failing auth middleware tests**

```typescript
// test/middleware/auth.test.ts
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { authMiddleware } from "../../src/middleware/auth";
import type { Env } from "../../src/types";

function createApp(authKey: string) {
  const app = new Hono<{ Bindings: Env }>();

  // Fake the env binding for tests
  app.use("*", async (c, next) => {
    (c.env as any).AUTH_KEY = authKey;
    await next();
  });

  app.use("/api/*", authMiddleware);
  app.get("/api/test", (c) => c.json({ ok: true }));
  app.get("/health", (c) => c.json({ ok: true }));
  return app;
}

describe("authMiddleware", () => {
  const AUTH_KEY = "test-secret-key-12345";

  it("passes with valid X-Auth-Key", async () => {
    const app = createApp(AUTH_KEY);
    const res = await app.request("/api/test", {
      headers: { "X-Auth-Key": AUTH_KEY },
    });
    expect(res.status).toBe(200);
  });

  it("returns 401 with missing X-Auth-Key", async () => {
    const app = createApp(AUTH_KEY);
    const res = await app.request("/api/test");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 with wrong X-Auth-Key", async () => {
    const app = createApp(AUTH_KEY);
    const res = await app.request("/api/test", {
      headers: { "X-Auth-Key": "wrong-key" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 with empty X-Auth-Key", async () => {
    const app = createApp(AUTH_KEY);
    const res = await app.request("/api/test", {
      headers: { "X-Auth-Key": "" },
    });
    expect(res.status).toBe(401);
  });

  it("does not apply to non /api/* routes", async () => {
    const app = createApp(AUTH_KEY);
    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- test/middleware/auth.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement auth middleware**

```typescript
// src/middleware/auth.ts
import type { MiddlewareHandler } from "hono";
import type { Env } from "../types";

async function sha256(data: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  return crypto.subtle.digest("SHA-256", encoder.encode(data));
}

export const authMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const provided = c.req.header("X-Auth-Key");
  if (!provided) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  const [expectedHash, providedHash] = await Promise.all([
    sha256(c.env.AUTH_KEY),
    sha256(provided),
  ]);

  const isValid = crypto.subtle.timingSafeEqual(expectedHash, providedHash);
  if (!isValid) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  await next();
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- test/middleware/auth.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/middleware/auth.ts test/middleware/auth.test.ts
git commit -m "feat: add auth middleware with SHA-256 timing-safe compare"
```

---

### Task 5: Error handler middleware

**Files:**
- Create: `src/middleware/error-handler.ts`
- Create: `test/middleware/error-handler.test.ts`

- [ ] **Step 1: Write failing error handler tests**

```typescript
// test/middleware/error-handler.test.ts
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { errorHandler } from "../../src/middleware/error-handler";

function createApp() {
  const app = new Hono();
  app.onError(errorHandler);
  app.get("/throw-generic", () => {
    throw new Error("something broke");
  });
  app.get("/throw-with-status", () => {
    const err = new Error("not found");
    (err as any).status = 404;
    throw err;
  });
  return app;
}

describe("errorHandler", () => {
  it("catches thrown errors and returns JSON", async () => {
    const app = createApp();
    const res = await app.request("/throw-generic");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("something broke");
  });

  it("respects custom status codes on errors", async () => {
    const app = createApp();
    const res = await app.request("/throw-with-status");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("not found");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- test/middleware/error-handler.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement error handler**

```typescript
// src/middleware/error-handler.ts
import type { ErrorHandler } from "hono";

export const errorHandler: ErrorHandler = (err, c) => {
  const status = (err as any).status ?? 500;
  return c.json({ success: false, error: err.message }, status);
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- test/middleware/error-handler.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/middleware/error-handler.ts test/middleware/error-handler.test.ts
git commit -m "feat: add error handler middleware"
```

---

## Chunk 3: Services — Token Manager & TickTick Client

### Task 6: Token manager service

**Files:**
- Create: `src/services/token-manager.ts`
- Create: `test/services/token-manager.test.ts`

- [ ] **Step 1: Write failing token manager tests**

```typescript
// test/services/token-manager.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
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
    const futureMs = String(Date.now() + 3600_000); // 1 hour from now
    const kv = createMockKV({
      ticktick_access_token: "valid-token",
      ticktick_refresh_token: "refresh-tok",
      ticktick_token_expires_at: futureMs,
    });
    const tm = new TokenManager(kv, "client-id", "client-secret");
    const token = await tm.getValidToken();
    expect(token).toBe("valid-token");
  });

  it("refreshes token when expiring within 5 minutes", async () => {
    const soonMs = String(Date.now() + 2 * 60_000); // 2 min from now (< 5 min threshold)
    const kv = createMockKV({
      ticktick_access_token: "old-token",
      ticktick_refresh_token: "refresh-tok",
      ticktick_token_expires_at: soonMs,
    });
    const tm = new TokenManager(kv, "client-id", "client-secret");

    // Mock global fetch for the token refresh call
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        access_token: "new-token",
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "new-refresh",
      }), { status: 200 })
    );
    vi.stubGlobal("fetch", mockFetch);

    const token = await tm.getValidToken();
    expect(token).toBe("new-token");
    expect(kv.put).toHaveBeenCalledWith("ticktick_access_token", "new-token");
    expect(kv.put).toHaveBeenCalledWith("ticktick_refresh_token", "new-refresh");

    vi.unstubAllGlobals();
  });

  it("throws when no tokens exist", async () => {
    const kv = createMockKV({});
    const tm = new TokenManager(kv, "client-id", "client-secret");
    await expect(tm.getValidToken()).rejects.toThrow("TickTick not authorized");
  });

  it("stores tokens from OAuth callback", async () => {
    const kv = createMockKV({});
    const tm = new TokenManager(kv, "client-id", "client-secret");
    await tm.storeTokens({
      access_token: "tok",
      refresh_token: "ref",
      expires_in: 3600,
    });
    expect(kv.put).toHaveBeenCalledWith("ticktick_access_token", "tok");
    expect(kv.put).toHaveBeenCalledWith("ticktick_refresh_token", "ref");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- test/services/token-manager.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement token manager**

```typescript
// src/services/token-manager.ts

const TOKEN_URL = "https://ticktick.com/oauth/token";
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

export class TokenManager {
  constructor(
    private kv: KVNamespace,
    private clientId: string,
    private clientSecret: string,
  ) {}

  async getValidToken(): Promise<string> {
    const [accessToken, refreshToken, expiresAt] = await Promise.all([
      this.kv.get("ticktick_access_token"),
      this.kv.get("ticktick_refresh_token"),
      this.kv.get("ticktick_token_expires_at"),
    ]);

    if (!accessToken || !refreshToken) {
      const err = new Error("TickTick not authorized. Visit /auth/login");
      (err as any).status = 503;
      throw err;
    }

    const expiresAtMs = Number(expiresAt ?? 0);
    if (Date.now() < expiresAtMs - REFRESH_THRESHOLD_MS) {
      return accessToken;
    }

    return this.refreshAccessToken(refreshToken);
  }

  private async refreshAccessToken(refreshToken: string): Promise<string> {
    const basicAuth = btoa(`${this.clientId}:${this.clientSecret}`);
    const res = await fetch(TOKEN_URL, {
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

    if (!res.ok) {
      const err = new Error("Failed to refresh TickTick token");
      (err as any).status = 502;
      throw err;
    }

    const data: TokenResponse = await res.json();
    await this.storeTokens(data);
    return data.access_token;
  }

  async storeTokens(data: { access_token: string; refresh_token?: string; expires_in: number }): Promise<void> {
    const expiresAt = String(Date.now() + data.expires_in * 1000);
    await Promise.all([
      this.kv.put("ticktick_access_token", data.access_token),
      data.refresh_token
        ? this.kv.put("ticktick_refresh_token", data.refresh_token)
        : Promise.resolve(),
      this.kv.put("ticktick_token_expires_at", expiresAt),
    ]);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- test/services/token-manager.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/token-manager.ts test/services/token-manager.test.ts
git commit -m "feat: add token manager with KV-backed refresh logic"
```

---

### Task 7: TickTick client service

**Files:**
- Create: `src/services/ticktick.ts`
- Create: `test/services/ticktick.test.ts`

- [ ] **Step 1: Write failing TickTick client tests**

```typescript
// test/services/ticktick.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
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
    vi.unstubAllGlobals();
  });

  describe("createTask", () => {
    it("sends correct POST request to TickTick API", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: "task-123", title: "Test" }), { status: 200 })
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
        })
      );
    });

    it("maps isAllDay boolean to string", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: "t1", title: "T" }), { status: 200 })
      );
      vi.stubGlobal("fetch", mockFetch);

      const client = new TickTickClient("tok");
      await client.createTask({ title: "All day", priority: 0, isAllDay: true });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.isAllDay).toBe("true");
    });

    it("throws on API error", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
        new Response("Forbidden", { status: 403 })
      ));

      const client = new TickTickClient("bad-token");
      await expect(client.createTask({ title: "T", priority: 0 }))
        .rejects.toThrow("TickTick API error");
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
      const staleTime = String(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      const kv = createMockKV({
        project_list: JSON.stringify([]),
        project_list_updated_at: staleTime,
      });

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify([
          { id: "p1", name: "Work" },
          { id: "p2", name: "Life" },
        ]), { status: 200 })
      );
      vi.stubGlobal("fetch", mockFetch);

      const client = new TickTickClient("tok");
      const projects = await client.getProjects(kv);
      expect(projects).toHaveLength(2);
      expect(kv.put).toHaveBeenCalledWith("project_list", expect.any(String));
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- test/services/ticktick.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement TickTick client**

```typescript
// src/services/ticktick.ts

const BASE_URL = "https://ticktick.com/open/v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface Project {
  id: string;
  name: string;
}

interface CreateTaskParams {
  title: string;
  content?: string;
  startDate?: string;
  dueDate?: string;
  isAllDay?: boolean;
  priority: number;
  projectId?: string;
  timeZone?: string;
  tags?: string[];
}

export class TickTickClient {
  constructor(private accessToken: string) {}

  async createTask(params: CreateTaskParams): Promise<{ id: string; title: string; [key: string]: unknown }> {
    const body: Record<string, unknown> = { ...params };

    // TickTick API expects isAllDay as string "true"/"false"
    if (typeof body.isAllDay === "boolean") {
      body.isAllDay = String(body.isAllDay);
    }

    const res = await fetch(`${BASE_URL}/task`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`TickTick API error: ${res.status}`);
    }

    return res.json();
  }

  async getProjects(kv: KVNamespace, forceRefresh = false): Promise<Project[]> {
    if (!forceRefresh) {
      const [cached, updatedAt] = await Promise.all([
        kv.get("project_list"),
        kv.get("project_list_updated_at"),
      ]);

      if (cached && updatedAt) {
        const age = Date.now() - Number(updatedAt);
        if (age < CACHE_TTL_MS) {
          return JSON.parse(cached);
        }
      }
    }

    return this.fetchAndCacheProjects(kv);
  }

  private async fetchAndCacheProjects(kv: KVNamespace): Promise<Project[]> {
    const res = await fetch(`${BASE_URL}/project`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch projects: ${res.status}`);
    }

    const projects: Project[] = (await res.json() as any[]).map((p) => ({
      id: p.id,
      name: p.name,
    }));

    await Promise.all([
      kv.put("project_list", JSON.stringify(projects)),
      kv.put("project_list_updated_at", String(Date.now())),
    ]);

    return projects;
  }

  resolveProjectId(projectName: string, projects: Project[]): string | undefined {
    const normalized = projectName.toLowerCase();
    const match = projects.find((p) => p.name.toLowerCase() === normalized);
    return match?.id;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- test/services/ticktick.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/ticktick.ts test/services/ticktick.test.ts
git commit -m "feat: add TickTick client with task creation, project cache, name resolution"
```

---

## Chunk 4: AI Provider & Prompt

### Task 8: AI provider factory

**Files:**
- Create: `src/services/ai-provider.ts`
- Create: `test/services/ai-provider.test.ts`

- [ ] **Step 1: Write failing provider factory tests**

```typescript
// test/services/ai-provider.test.ts
import { describe, it, expect } from "vitest";
import { createModel } from "../../src/services/ai-provider";

describe("createModel", () => {
  it("returns anthropic model by default", () => {
    const model = createModel({
      AI_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "sk-test",
      ANTHROPIC_BASE_URL: "https://api.anthropic.com",
      ANTHROPIC_MODEL: "claude-haiku-4-5",
    } as any);
    expect(model).toBeDefined();
    expect(model.modelId).toContain("claude-haiku-4-5");
  });

  it("returns anthropic model when AI_PROVIDER is empty", () => {
    const model = createModel({
      ANTHROPIC_API_KEY: "sk-test",
      ANTHROPIC_BASE_URL: "",
      ANTHROPIC_MODEL: "claude-haiku-4-5",
    } as any);
    expect(model).toBeDefined();
  });

  it("returns workers-ai model when configured", () => {
    const mockAi = {}; // Cloudflare AI binding stub
    const model = createModel({
      AI_PROVIDER: "workers-ai",
      AI: mockAi,
      WORKERS_AI_MODEL: "@cf/meta/llama-3.1-8b-instruct",
    } as any);
    expect(model).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- test/services/ai-provider.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement provider factory**

```typescript
// src/services/ai-provider.ts
import { createAnthropic } from "@ai-sdk/anthropic";
import { createWorkersAI } from "workers-ai-provider";
import type { Env } from "../types";

export function createModel(env: Env) {
  if (env.AI_PROVIDER === "workers-ai") {
    const workersai = createWorkersAI({ binding: env.AI });
    return workersai(env.WORKERS_AI_MODEL || "@cf/meta/llama-3.1-8b-instruct");
  }

  const anthropic = createAnthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    baseURL: env.ANTHROPIC_BASE_URL || "https://api.anthropic.com",
  });

  return anthropic(env.ANTHROPIC_MODEL || "claude-haiku-4-5");
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- test/services/ai-provider.test.ts
```

Expected: All tests PASS. (Note: the workers-ai test may need the AI binding mock adjusted depending on the SDK — fix if needed.)

- [ ] **Step 5: Commit**

```bash
git add src/services/ai-provider.ts test/services/ai-provider.test.ts
git commit -m "feat: add AI provider factory supporting anthropic and workers-ai"
```

---

### Task 9: LLM prompt builder

**Files:**
- Create: `src/prompts/task-parser.ts`
- Create: `test/prompts/task-parser.test.ts`

- [ ] **Step 1: Write failing prompt builder tests**

```typescript
// test/prompts/task-parser.test.ts
import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../../src/prompts/task-parser";

describe("buildSystemPrompt", () => {
  it("includes current time in the given timezone", () => {
    const prompt = buildSystemPrompt({
      timezone: "Asia/Singapore",
      projectNames: ["Work", "Life"],
    });
    // Should contain a formatted date string
    expect(prompt).toContain("Asia/Singapore");
  });

  it("includes project names", () => {
    const prompt = buildSystemPrompt({
      timezone: "Asia/Singapore",
      projectNames: ["Work", "生活", "PBA"],
    });
    expect(prompt).toContain("Work");
    expect(prompt).toContain("生活");
    expect(prompt).toContain("PBA");
  });

  it("does not include project IDs", () => {
    const prompt = buildSystemPrompt({
      timezone: "Asia/Singapore",
      projectNames: ["Work"],
    });
    // Should not have anything that looks like a TickTick ID
    expect(prompt).not.toMatch(/[0-9a-f]{24}/);
  });

  it("includes priority inference guidance", () => {
    const prompt = buildSystemPrompt({
      timezone: "Asia/Singapore",
      projectNames: [],
    });
    expect(prompt).toContain("priority");
    expect(prompt).toContain("0");
    expect(prompt).toContain("5");
  });

  it("includes multi-task instruction", () => {
    const prompt = buildSystemPrompt({
      timezone: "Asia/Singapore",
      projectNames: [],
    });
    expect(prompt).toMatch(/multiple|多个|array/i);
  });

  it("falls back to Asia/Singapore for invalid timezones", () => {
    const prompt = buildSystemPrompt({
      timezone: "Mars/Olympus",
      projectNames: [],
    });
    expect(prompt).toContain("Asia/Singapore");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- test/prompts/task-parser.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement prompt builder**

```typescript
// src/prompts/task-parser.ts

interface PromptContext {
  timezone: string;
  projectNames: string[];
}

const DEFAULT_TIMEZONE = "Asia/Singapore";

function resolveTimeZone(timezone: string): string {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function buildSystemPrompt(ctx: PromptContext): string {
  // Defense in depth: request validation should already reject invalid IANA timezone names.
  const timeZone = resolveTimeZone(ctx.timezone);
  const now = new Date().toLocaleString("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const projectList = ctx.projectNames.length > 0
    ? ctx.projectNames.map((name) => `- ${name}`).join("\n")
    : "- (no projects, leave projectName empty)";

  return `You are a task parser. Convert voice input into structured tasks.

Current time: ${now} (timezone: ${timeZone})

User's project list:
${projectList}

Instructions:
- Parse the voice input into one or more tasks. If the input describes multiple tasks, return them all as separate items in the tasks array.
- For each task, extract: title, content (optional extra details), startDate, dueDate, isAllDay, priority, projectName, tags.
- Date format: yyyy-MM-dd'T'HH:mm:ss+ZZZZ (e.g. 2026-03-12T15:00:00+0800). Use the user's timezone offset.
- If no specific time is mentioned (e.g. "明天买牛奶"), set isAllDay to true and use midnight for the date.
- Priority: assess from context.
  - Explicit urgency words (重要, 紧急, urgent, emergency, ASAP) → 3 (medium) or 5 (high).
  - Implicit urgency (medical appointments, tight deadlines, critical tasks) → raise priority accordingly.
  - No urgency signals → 0 (none).
  - Valid values: 0 (none), 1 (low), 3 (medium), 5 (high).
- projectName: match the voice input to one of the project names listed above. Output the project name exactly as listed. If no match, omit projectName.
- tags: extract relevant keywords as tags if mentioned.
- Maximum 5 tasks per input.`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- test/prompts/task-parser.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/prompts/task-parser.ts test/prompts/task-parser.test.ts
git commit -m "feat: add LLM system prompt builder with project names and priority guidance"
```

---

## Chunk 5: Routes & App Entrypoint

### Task 10: Health route

**Files:**
- Create: `src/routes/health.ts`
- Create: `test/routes/health.test.ts`

- [ ] **Step 1: Write failing health route test**

```typescript
// test/routes/health.test.ts
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { healthRoute } from "../../src/routes/health";

describe("GET /health", () => {
  it("returns 200 with ok status", async () => {
    const app = new Hono();
    app.route("/", healthRoute);
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- test/routes/health.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement health route**

```typescript
// src/routes/health.ts
import { Hono } from "hono";

export const healthRoute = new Hono();

healthRoute.get("/health", (c) => c.json({ status: "ok" }));
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test -- test/routes/health.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/health.ts test/routes/health.test.ts
git commit -m "feat: add health check route"
```

---

### Task 11: Projects route

**Files:**
- Create: `src/routes/projects.ts`
- Create: `test/routes/projects.test.ts`

- [ ] **Step 1: Write failing projects route test**

```typescript
// test/routes/projects.test.ts
import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { projectsRoute } from "../../src/routes/projects";
import type { Env } from "../../src/types";

describe("POST /api/projects", () => {
  it("returns refreshed project list", async () => {
    const mockKV = {
      get: vi.fn()
        .mockResolvedValueOnce("valid-token")    // access_token
        .mockResolvedValueOnce("refresh-tok")     // refresh_token
        .mockResolvedValueOnce(String(Date.now() + 3600_000)), // expires_at
      put: vi.fn().mockResolvedValue(undefined),
    };

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([
        { id: "p1", name: "Work" },
        { id: "p2", name: "Life" },
      ]), { status: 200 })
    );
    vi.stubGlobal("fetch", mockFetch);

    const app = new Hono<{ Bindings: Env }>();
    app.use("*", async (c, next) => {
      (c.env as any).TICKTICK_STORE = mockKV;
      (c.env as any).TICKTICK_CLIENT_ID = "cid";
      (c.env as any).TICKTICK_SECRET = "csec";
      await next();
    });
    app.route("/", projectsRoute);

    const res = await app.request("/api/projects", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.projects).toHaveLength(2);

    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- test/routes/projects.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement projects route**

```typescript
// src/routes/projects.ts
import { Hono } from "hono";
import type { Env } from "../types";
import { TokenManager } from "../services/token-manager";
import { TickTickClient } from "../services/ticktick";

export const projectsRoute = new Hono<{ Bindings: Env }>();

projectsRoute.post("/api/projects", async (c) => {
  const tm = new TokenManager(c.env.TICKTICK_STORE, c.env.TICKTICK_CLIENT_ID, c.env.TICKTICK_SECRET);
  const token = await tm.getValidToken();
  const client = new TickTickClient(token);
  const projects = await client.getProjects(c.env.TICKTICK_STORE, true);
  return c.json({ success: true, projects });
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test -- test/routes/projects.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/projects.ts test/routes/projects.test.ts
git commit -m "feat: add POST /api/projects route for cache refresh"
```

---

### Task 12: Task route (main orchestration)

**Files:**
- Create: `src/routes/task.ts`
- Create: `test/routes/task.test.ts`

- [ ] **Step 1: Write failing task route tests**

```typescript
// test/routes/task.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { taskRoute } from "../../src/routes/task";
import type { Env } from "../../src/types";

// We mock generateObject at the module level
vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

import { generateObject } from "ai";

function createApp() {
  const mockKV = {
    get: vi.fn().mockImplementation((key: string) => {
      const store: Record<string, string> = {
        ticktick_access_token: "valid-token",
        ticktick_refresh_token: "ref-tok",
        ticktick_token_expires_at: String(Date.now() + 3600_000),
        project_list: JSON.stringify([{ id: "p1", name: "Work" }, { id: "p2", name: "生活" }]),
        project_list_updated_at: String(Date.now()),
      };
      return Promise.resolve(store[key] ?? null);
    }),
    put: vi.fn().mockResolvedValue(undefined),
  };

  const app = new Hono<{ Bindings: Env }>();
  app.use("*", async (c, next) => {
    Object.assign(c.env, {
      TICKTICK_STORE: mockKV,
      TICKTICK_CLIENT_ID: "cid",
      TICKTICK_SECRET: "csec",
      AI_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "sk-test",
      ANTHROPIC_BASE_URL: "https://api.anthropic.com",
      ANTHROPIC_MODEL: "claude-haiku-4-5",
    });
    await next();
  });
  app.route("/", taskRoute);
  return app;
}

describe("POST /api/task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns 400 for missing text", async () => {
    const app = createApp();
    const res = await app.request("/api/task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed JSON", async () => {
    const app = createApp();
    const res = await app.request("/api/task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{invalid",
    });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toContain("Invalid JSON");
  });

  it("returns 400 for invalid timezone", async () => {
    const app = createApp();
    const res = await app.request("/api/task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "开会", timezone: "Mars/Olympus" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toContain("timezone");
  });

  it("creates a single task successfully", async () => {
    (generateObject as any).mockResolvedValue({
      object: {
        tasks: [{
          title: "开会",
          dueDate: "2026-03-13T15:00:00+0800",
          priority: 3,
          projectName: "Work",
        }],
      },
    });

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "t1", title: "开会", projectId: "p1" }), { status: 200 })
    );
    vi.stubGlobal("fetch", mockFetch);

    const app = createApp();
    const res = await app.request("/api/task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "明天三点开会 重要 放到work", timezone: "Asia/Singapore" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.tasks).toHaveLength(1);
    expect(body.summary).toContain("开会");
  });

  it("creates multiple tasks and reports partial failure", async () => {
    (generateObject as any).mockResolvedValue({
      object: {
        tasks: [
          { title: "开会", priority: 0 },
          { title: "买牛奶", priority: 0 },
        ],
      },
    });

    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify({ id: "t1", title: "开会" }), { status: 200 });
      }
      return new Response("Error", { status: 500 });
    });
    vi.stubGlobal("fetch", mockFetch);

    const app = createApp();
    const res = await app.request("/api/task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "明天开会 后天买牛奶" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.tasks).toHaveLength(1);
    expect(body.failed).toHaveLength(1);
  });

  it("returns 502 when LLM fails", async () => {
    (generateObject as any).mockRejectedValue(new Error("LLM timeout"));

    const app = createApp();
    const res = await app.request("/api/task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "开会" }),
    });

    expect(res.status).toBe(502);
    const body = await res.json() as any;
    expect(body.success).toBe(false);
    expect(body.error).toContain("parse");
  });

  it("returns 502 when LLM returns no tasks", async () => {
    (generateObject as any).mockResolvedValue({
      object: {
        tasks: [],
      },
    });

    const app = createApp();
    const res = await app.request("/api/task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "开会" }),
    });

    expect(res.status).toBe(502);
    const body = await res.json() as any;
    expect(body.success).toBe(false);
    expect(body.error).toContain("parse");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- test/routes/task.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement task route**

```typescript
// src/routes/task.ts
import { Hono } from "hono";
import { generateObject } from "ai";
import type { Env } from "../types";
import { RequestSchema, TaskArraySchema } from "../schemas/task";
import { createModel } from "../services/ai-provider";
import { TokenManager } from "../services/token-manager";
import { TickTickClient } from "../services/ticktick";
import { buildSystemPrompt } from "../prompts/task-parser";

export const taskRoute = new Hono<{ Bindings: Env }>();

taskRoute.post("/api/task", async (c) => {
  // 1. Validate request
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: "Invalid JSON body" }, 400);
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    const timezoneIssue = parsed.error.issues.find((issue) => issue.path[0] === "timezone");
    const textIssue = parsed.error.issues.find((issue) => issue.path[0] === "text");

    if (timezoneIssue) {
      return c.json({ success: false, error: "Invalid timezone" }, 400);
    }

    if (textIssue) {
      return c.json({ success: false, error: "Text is required" }, 400);
    }

    return c.json({ success: false, error: "Invalid request" }, 400);
  }
  const { text, timezone } = parsed.data;

  // 2. Get valid token
  const tm = new TokenManager(c.env.TICKTICK_STORE, c.env.TICKTICK_CLIENT_ID, c.env.TICKTICK_SECRET);
  const token = await tm.getValidToken();
  const client = new TickTickClient(token);

  // 3. Get project list
  const projects = await client.getProjects(c.env.TICKTICK_STORE);
  const projectNames = projects.map((p) => p.name);

  // 4. LLM parse
  let llmResult;
  try {
    const model = createModel(c.env);
    llmResult = await generateObject({
      model,
      schema: TaskArraySchema,
      system: buildSystemPrompt({ timezone, projectNames }),
      prompt: text,
    });
  } catch {
    return c.json({ success: false, error: "Failed to parse voice input" }, 502);
  }

  const { tasks: parsedTasks } = llmResult.object;
  if (parsedTasks.length === 0) {
    return c.json({ success: false, error: "Failed to parse voice input" }, 502);
  }

  // 5. Resolve projectName → projectId (refetch on miss)
  let currentProjects = projects;
  let refetched = false;
  const tasksWithIds = [];
  for (const task of parsedTasks) {
    let projectId: string | undefined;
    if (task.projectName) {
      projectId = client.resolveProjectId(task.projectName, currentProjects);
      if (!projectId && !refetched) {
        currentProjects = await client.getProjects(c.env.TICKTICK_STORE, true);
        refetched = true;
        projectId = client.resolveProjectId(task.projectName, currentProjects);
      }
    }
    const { projectName, ...rest } = task;
    tasksWithIds.push({ ...rest, projectId, timeZone: timezone });
  }

  // 6. Create tasks in parallel
  const results = await Promise.allSettled(
    tasksWithIds.map((task) => client.createTask(task))
  );

  // 7. Build response
  const succeeded: Array<{ id: string; title: string; dueDate?: string; project?: string }> = [];
  const failed: Array<{ title: string; error: string }> = [];

  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      const projectName = currentProjects.find((p) => p.id === tasksWithIds[i].projectId)?.name;
      succeeded.push({
        id: result.value.id,
        title: result.value.title,
        dueDate: tasksWithIds[i].dueDate,
        project: projectName,
      });
    } else {
      failed.push({ title: tasksWithIds[i].title, error: result.reason?.message ?? "Unknown error" });
    }
  });

  if (succeeded.length === 0 && failed.length > 0) {
    return c.json({ success: false, error: "Failed to create tasks" }, 502);
  }

  const summaryParts = succeeded.map((t) => t.title);
  const summary = succeeded.length === 1
    ? `已创建: ${summaryParts[0]}`
    : `已创建 ${succeeded.length} 个任务: ${summaryParts.join(", ")}`;

  const finalSummary = failed.length > 0
    ? `${summary} (${failed.length} 个失败)`
    : summary;

  return c.json({ success: true, summary: finalSummary, tasks: succeeded, failed });
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- test/routes/task.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/task.ts test/routes/task.test.ts
git commit -m "feat: add POST /api/task route with LLM parsing and multi-task creation"
```

---

### Task 13: Auth routes (OAuth login + callback)

**Files:**
- Create: `src/routes/auth.ts`
- Create: `test/routes/auth.test.ts`

- [ ] **Step 1: Write failing auth route tests**

```typescript
// test/routes/auth.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { authRoutes } from "../../src/routes/auth";
import type { Env } from "../../src/types";

function createApp() {
  const mockKV = {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
  };

  const app = new Hono<{ Bindings: Env }>();
  app.use("*", async (c, next) => {
    Object.assign(c.env, {
      TICKTICK_STORE: mockKV,
      TICKTICK_CLIENT_ID: "test-client-id",
      TICKTICK_SECRET: "test-secret",
      AUTH_KEY: "my-auth-key",
    });
    await next();
  });
  app.route("/", authRoutes);
  return { app, mockKV };
}

describe("GET /auth/login", () => {
  it("redirects to TickTick OAuth authorize URL with state", async () => {
    const { app } = createApp();
    const res = await app.request("/auth/login");
    expect(res.status).toBe(302);
    const location = res.headers.get("Location")!;
    expect(location).toContain("ticktick.com/oauth/authorize");
    expect(location).toContain("client_id=test-client-id");
    expect(location).toContain("state=");
  });
});

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects callback with missing state", async () => {
    const { app } = createApp();
    const res = await app.request("/auth/callback?code=abc");
    expect(res.status).toBe(400);
  });

  it("rejects callback with invalid HMAC state", async () => {
    const { app } = createApp();
    const res = await app.request("/auth/callback?code=abc&state=invalid-state");
    expect(res.status).toBe(403);
  });

  it("exchanges code for tokens on valid callback", async () => {
    // First get a valid state from /auth/login
    const { app, mockKV } = createApp();
    const loginRes = await app.request("/auth/login");
    const location = loginRes.headers.get("Location")!;
    const stateParam = new URL(location).searchParams.get("state")!;

    // Mock token exchange
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_in: 3600,
      }), { status: 200 })
    );
    vi.stubGlobal("fetch", mockFetch);

    const res = await app.request(`/auth/callback?code=authcode123&state=${encodeURIComponent(stateParam)}`);
    expect(res.status).toBe(200);
    expect(mockKV.put).toHaveBeenCalledWith("ticktick_access_token", "new-access");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- test/routes/auth.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement auth routes**

```typescript
// src/routes/auth.ts
import { Hono } from "hono";
import type { Env } from "../types";
import { TokenManager } from "../services/token-manager";

const AUTHORIZE_URL = "https://ticktick.com/oauth/authorize";
const TOKEN_URL = "https://ticktick.com/oauth/token";
const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

export const authRoutes = new Hono<{ Bindings: Env }>();

async function hmacSign(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function hmacVerify(data: string, signature: string, secret: string): Promise<boolean> {
  const expected = await hmacSign(data, secret);
  // Use constant-time comparison via SHA-256 of both signatures
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
    crypto.subtle.digest("SHA-256", enc.encode(signature)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

function generateState(nonce: string, timestamp: number): string {
  return `${nonce}.${timestamp}`;
}

authRoutes.get("/auth/login", async (c) => {
  const nonce = crypto.randomUUID();
  const timestamp = Date.now();
  const payload = generateState(nonce, timestamp);
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

  // Parse and verify state: nonce.timestamp.signature
  const parts = state.split(".");
  if (parts.length < 3) {
    return c.json({ success: false, error: "Invalid state" }, 403);
  }

  const signature = parts.pop()!;
  const payload = parts.join(".");

  const valid = await hmacVerify(payload, signature, c.env.AUTH_KEY);
  if (!valid) {
    return c.json({ success: false, error: "Invalid state signature" }, 403);
  }

  // Check timestamp
  const timestamp = Number(parts[1]);
  if (Date.now() - timestamp > STATE_MAX_AGE_MS) {
    return c.json({ success: false, error: "State expired" }, 403);
  }

  // Exchange code for tokens
  const redirectUri = new URL("/auth/callback", c.req.url).toString();
  const basicAuth = btoa(`${c.env.TICKTICK_CLIENT_ID}:${c.env.TICKTICK_SECRET}`);

  const tokenRes = await fetch(TOKEN_URL, {
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

  if (!tokenRes.ok) {
    return c.json({ success: false, error: "Failed to exchange code for tokens" }, 502);
  }

  const tokenData = await tokenRes.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const tm = new TokenManager(c.env.TICKTICK_STORE, c.env.TICKTICK_CLIENT_ID, c.env.TICKTICK_SECRET);
  await tm.storeTokens(tokenData);

  return c.html("<h1>Authorization successful!</h1><p>You can close this page.</p>");
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- test/routes/auth.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/auth.ts test/routes/auth.test.ts
git commit -m "feat: add OAuth login/callback routes with HMAC-signed state"
```

---

### Task 14: App entrypoint

**Files:**
- Create: `src/index.ts`
- Create: `test/index.test.ts`

- [ ] **Step 1: Write failing entrypoint integration test**

```typescript
// test/index.test.ts
import { describe, it, expect } from "vitest";
import app from "../src/index";

describe("App entrypoint", () => {
  it("responds to GET /health", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
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
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- test/index.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement app entrypoint**

```typescript
// src/index.ts
import { Hono } from "hono";
import type { Env } from "./types";
import { authMiddleware } from "./middleware/auth";
import { errorHandler } from "./middleware/error-handler";
import { healthRoute } from "./routes/health";
import { taskRoute } from "./routes/task";
import { projectsRoute } from "./routes/projects";
import { authRoutes } from "./routes/auth";

const app = new Hono<{ Bindings: Env }>();

// Global error handler
app.onError(errorHandler);

// Auth middleware for /api/* and /auth/login
app.use("/api/*", authMiddleware);
app.use("/auth/login", authMiddleware);

// Routes
app.route("/", healthRoute);
app.route("/", taskRoute);
app.route("/", projectsRoute);
app.route("/", authRoutes);

export default app;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- test/index.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
pnpm test
```

Expected: All tests across all files PASS.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts test/index.test.ts
git commit -m "feat: wire up Hono app with all routes and middleware"
```

---

## Chunk 6: Final Verification & Deploy

### Task 15: Local smoke test

- [ ] **Step 1: Create .dev.vars with real credentials**

Copy `.dev.vars.example` to `.dev.vars` and fill in real values.

- [ ] **Step 2: Start local dev server**

```bash
pnpm dev
```

Expected: Server starts at `http://localhost:8787`.

- [ ] **Step 3: Test health endpoint**

```bash
curl http://localhost:8787/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 4: Test auth rejection**

```bash
curl -X POST http://localhost:8787/api/task \
  -H "Content-Type: application/json" \
  -d '{"text":"test"}'
```

Expected: `{"success":false,"error":"Unauthorized"}` with status 401.

- [ ] **Step 5: Test OAuth login redirect**

```bash
curl -v http://localhost:8787/auth/login \
  -H "X-Auth-Key: YOUR_AUTH_KEY"
```

Expected: 302 redirect to `ticktick.com/oauth/authorize` with `state` and `client_id` params.

- [ ] **Step 6: Test task creation (requires valid TickTick tokens in KV)**

```bash
curl -X POST http://localhost:8787/api/task \
  -H "X-Auth-Key: YOUR_AUTH_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text":"明天下午三点开会 比较重要","timezone":"Asia/Singapore"}'
```

Expected: `{"success":true,"summary":"已创建: ...","tasks":[...],"failed":[]}`

---

### Task 16: Deploy to Cloudflare

- [ ] **Step 1: Create KV namespace**

```bash
pnpm wrangler kv namespace create TICKTICK_STORE
```

Copy the output ID and update `wrangler.toml`.

- [ ] **Step 2: Set secrets**

```bash
pnpm wrangler secret put ANTHROPIC_API_KEY
pnpm wrangler secret put ANTHROPIC_BASE_URL
pnpm wrangler secret put TICKTICK_CLIENT_ID
pnpm wrangler secret put TICKTICK_SECRET
pnpm wrangler secret put AUTH_KEY
```

- [ ] **Step 3: Deploy**

```bash
pnpm wrangler deploy
```

Expected: Deployed to `https://voice2ticktick.<your-subdomain>.workers.dev`.

- [ ] **Step 4: Complete OAuth setup**

The `/auth/login` route requires `X-Auth-Key` as a header (browsers can't set custom headers). Use curl to get the redirect URL, then open it in a browser:

```bash
curl -v https://voice2ticktick.<your-subdomain>.workers.dev/auth/login \
  -H "X-Auth-Key: YOUR_AUTH_KEY"
```

Copy the `Location` header URL from the 302 response and open it in your browser. Complete TickTick authorization there.

- [ ] **Step 5: Test production endpoint**

```bash
curl -X POST https://voice2ticktick.<your-subdomain>.workers.dev/api/task \
  -H "X-Auth-Key: YOUR_AUTH_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text":"测试任务","timezone":"Asia/Singapore"}'
```

Expected: Task created in TickTick.

- [ ] **Step 6: Final commit**

```bash
git add wrangler.toml
git commit -m "chore: finalize wrangler.toml with KV namespace ID"
```
