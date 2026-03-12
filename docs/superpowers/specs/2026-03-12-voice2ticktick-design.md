# voice2ticktick — Design Spec

**Date:** 2026-03-12
**Status:** Approved

## Overview

Convert iPhone Action Button voice input into TickTick tasks. The flow: iPhone Action Button → iOS Dictate (on-device ASR) → Cloudflare Worker → AI (NLP parsing) → TickTick API → notification feedback.

## Stack & Dependencies

**Runtime:** Cloudflare Workers (TypeScript) + Hono + Zod

**Dependencies:**
- `hono` — routing and middleware
- `zod` — schema validation
- `ai` — Vercel AI SDK core (`generateObject`)
- `@ai-sdk/anthropic` — Anthropic provider (also works with Zenmux via custom `baseURL`)
- `workers-ai-provider` — Cloudflare Workers AI provider

**Dev dependencies:** `wrangler`, `@cloudflare/workers-types`, `vitest`, `@cloudflare/vitest-pool-workers`, `typescript`

## AI Provider Configuration

Provider is selected by `AI_PROVIDER` env var:

- **`anthropic` (default):** Uses `@ai-sdk/anthropic` with `baseURL` set to `ANTHROPIC_BASE_URL` (Zenmux endpoint or direct Anthropic). Model configurable via `ANTHROPIC_MODEL` (default: `claude-haiku-4-5`).
- **`workers-ai`:** Uses `workers-ai-provider` with the `AI` binding from `wrangler.toml`. Model configurable via `WORKERS_AI_MODEL` (default: `@cf/meta/llama-3.1-8b-instruct`).

Both go through `generateObject()` with the same Zod schema — the rest of the pipeline is provider-agnostic.

**`ANTHROPIC_BASE_URL` default:** If not set, defaults to `https://api.anthropic.com`. Set to your Zenmux endpoint to use a custom API gateway.

### Provider Factory (`src/services/ai-provider.ts`)

```typescript
function createProvider(env: Env) {
  if (env.AI_PROVIDER === 'workers-ai') {
    return workersai({ binding: env.AI });
  }
  return createAnthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    baseURL: env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
  });
}
```

## Routes & Middleware

### Routes

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/task` | `X-Auth-Key` | Main route — voice text → parse → create task(s) |
| `POST` | `/api/projects` | `X-Auth-Key` | Force-refresh project list cache |
| `GET` | `/auth/login` | `X-Auth-Key` | Redirect to TickTick OAuth authorize URL (generates `state` token) |
| `GET` | `/auth/callback` | `state` HMAC | OAuth callback — verifies signed `state`, exchanges code for tokens |
| `GET` | `/health` | None | Health check |

### Middleware (applied to `/api/*` and `/auth/login`)

1. **Auth middleware** — validates `X-Auth-Key` header against `AUTH_KEY` secret using `crypto.subtle.timingSafeEqual`. Must pad/hash both values to equal length before comparison (Cloudflare's `timingSafeEqual` throws on length mismatch). Compare `SHA-256(input)` vs `SHA-256(AUTH_KEY)` to guarantee fixed-length buffers. Returns 401 if missing or invalid.
2. **Error handler** — wraps route handlers, catches thrown errors, maps to `{ success: false, error: "..." }` with appropriate HTTP status codes.

### `POST /api/task` Orchestration Flow

1. Validate request body: `{ "text": string, "timezone": string }` (Zod)
2. Get valid TickTick token (auto-refresh if expiring within 5 min)
3. Get project list (from KV cache, refresh if >24h stale)
4. Build provider based on `AI_PROVIDER` env var
5. `generateObject()` with system prompt (current time in user's timezone + project names + priority inference rules) → returns array of parsed tasks (with `projectName`, not `projectId`)
6. Map each task's `projectName` → `projectId` via deterministic server-side lookup against cached project list (refetch on miss)
7. `Promise.allSettled()` — create all tasks in TickTick in parallel
7. Return summary response

## LLM Integration & Schema

### System Prompt

Injects dynamic context:
- Current time in user's timezone (from request body `timezone` field, e.g. `Asia/Singapore`)
- User's TickTick project names from KV cache (names only, no IDs — the LLM outputs `projectName`, server resolves to `projectId`)
- Priority inference guidance
- Output schema instructions

### Priority Inference (LLM-driven)

The LLM decides priority based on the full context of the voice input:
1. **Explicit signals** — words like "重要", "紧急", "urgent", "emergency", "ASAP" → higher priority (3 or 5)
2. **Implicit signals** — the LLM judges based on the task nature (e.g. "医院检查" or "deadline明天" might warrant higher priority even without explicit keywords)
3. **Fallback** — if no urgency signals detected, default to 0 (normal)

TickTick priority values: `0` = none, `1` = low, `3` = medium, `5` = high.

### Zod Output Schema (`TaskArraySchema`)

```typescript
z.object({
  tasks: z.array(z.object({
    title: z.string().min(1),
    content: z.string().optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{4}$/).optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{4}$/).optional(),
    isAllDay: z.boolean().optional(),  // true if no specific time mentioned (mapped to string for API)
    priority: z.union([z.literal(0), z.literal(1), z.literal(3), z.literal(5)]),
    projectName: z.string().optional(), // human-readable name; server maps to projectId
    tags: z.array(z.string()).optional(),
  })).min(1).max(5)
})
```

### Request Schema

```typescript
z.object({
  text: z.string().trim().min(1),
  timezone: z.string().default("Asia/Singapore").refine(isValidTimeZone, {
    message: "Invalid timezone"
  })
})
```

`isValidTimeZone` should validate the string with `Intl.DateTimeFormat` so only real IANA timezone identifiers are accepted.

### Multi-task Support

One voice input can produce multiple tasks. The LLM returns an array, and tasks are created in parallel via `Promise.allSettled()`. If some fail, the response reports partial results.

### Project Matching (two-stage)

1. **LLM stage:** The system prompt includes project names (not IDs). The LLM outputs a `projectName` string (e.g. "工作") based on voice input.
2. **Server stage:** The server does a deterministic case-insensitive lookup of `projectName` against the cached project list to resolve `projectId`. On miss, refetches the project list once and retries. If still no match, `projectId` is omitted (task goes to inbox).

## TickTick API (from official openapi.yaml)

### Base URL

```
https://ticktick.com/open/v1
```

### POST /open/v1/task — Create Task

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | **Yes** | Task title |
| `projectId` | string | No | Project ID (omit → Inbox) |
| `content` | string | No | Task body/notes |
| `desc` | string | No | Checklist description |
| `isAllDay` | string | No | `"true"` or `"false"` (string, not boolean) |
| `startDate` | string | No | `yyyy-MM-dd'T'HH:mm:ssZ` e.g. `"2023-04-23T12:00:00+0000"` |
| `dueDate` | string | No | Same format |
| `timeZone` | string | No | IANA timezone e.g. `"Asia/Singapore"` |
| `reminders` | string[] | No | RFC 5545 triggers |
| `repeatFlag` | string | No | RFC 5545 RRULE |
| `priority` | int32 | No | `0`=none, `1`=low, `3`=medium, `5`=high |
| `sortOrder` | int64 | No | Sort order |
| `items` | ChecklistItem[] | No | Subtasks |

### Other Endpoints Used

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/open/v1/project` | List all projects (for cache) |

### OAuth2

- **Authorize:** `https://ticktick.com/oauth/authorize`
- **Token:** `https://ticktick.com/oauth/token`
- **Auth header:** `Authorization: Basic base64(client_id:client_secret)`
- **Body format:** `application/x-www-form-urlencoded`
- **Scopes:** `tasks:read tasks:write`
- **Refresh:** Same token URL with `grant_type=refresh_token`

## Token Management & KV Storage

### KV Keys

| Key | Value | Description |
|-----|-------|-------------|
| `ticktick_access_token` | Bearer token string | TickTick access token |
| `ticktick_refresh_token` | Refresh token string | Never expires unless revoked |
| `ticktick_token_expires_at` | Unix timestamp (ms) | Token expiry time |
| `project_list` | JSON array of `{id, name}` | Cached project list |
| `project_list_updated_at` | Unix timestamp (ms) | Cache timestamp |

### Token Refresh Logic

- On every `/api/*` request, read `access_token` + `expires_at` from KV
- If current time > `expires_at - 5 minutes`: POST to token endpoint with `grant_type=refresh_token`, write new tokens back to KV
- If no tokens exist: return error pointing user to `/auth/login`

### Project Cache

- `getProjects()` reads from KV, refreshes if stale (>24h) or missing
- `POST /api/projects` forces immediate refresh

### OAuth Flow (one-time setup)

1. `GET /auth/login` (requires `X-Auth-Key`) → generates a `state` value as `HMAC-SHA256(nonce + timestamp, AUTH_KEY)` concatenated with the nonce and timestamp. No KV write needed — avoids Workers KV eventual consistency issues. Redirects to TickTick authorize URL with `state` param.
2. User authorizes → TickTick redirects to `GET /auth/callback?code=xxx&state=yyy`
3. Callback parses `state`, recomputes HMAC with `AUTH_KEY`, rejects if signature invalid or timestamp > 10 minutes old (CSRF protection per RFC 6749). Exchanges code for tokens, stores in KV, returns success HTML.

## Timezone Handling

The iOS Shortcut sends the device's current timezone in the request body (e.g. `"Asia/Singapore"`, `"America/New_York"`). This is used in two places:

1. **LLM system prompt** — so "tomorrow 3pm" resolves to the correct local time
2. **TickTick `timeZone` field** — so the task displays correctly in TickTick

Falls back to `"Asia/Singapore"` if not provided. Invalid IANA timezone identifiers are rejected with HTTP 400 instead of being passed through to the prompt builder.

## Error Handling & Response Format

### Success Response

```json
{
  "success": true,
  "summary": "已创建 2 个任务: 开会 (3/12 15:00), 买牛奶 (3/13)",
  "tasks": [{ "id": "xxx", "title": "...", "dueDate": "...", "project": "工作" }],
  "failed": []
}
```

### Partial Failure

```json
{
  "success": true,
  "summary": "已创建 1 个任务, 1 个失败: 开会 ✓, 买牛奶 ✗",
  "tasks": [{ ... }],
  "failed": [{ "title": "买牛奶", "error": "TickTick API error" }]
}
```

### Error Responses

| Scenario | HTTP Status | Error |
|----------|------------|-------|
| Missing/invalid `X-Auth-Key` | 401 | `"Unauthorized"` |
| Malformed JSON body | 400 | `"Invalid JSON body"` |
| Missing `text` field or empty | 400 | `"Text is required"` |
| Invalid timezone | 400 | `"Invalid timezone"` |
| No TickTick tokens in KV | 503 | `"TickTick not authorized. Visit /auth/login"` |
| Token refresh fails | 502 | `"Failed to refresh TickTick token"` |
| LLM `generateObject()` fails | 502 | `"Failed to parse voice input"` |
| All TickTick API calls fail | 502 | `"Failed to create tasks"` |

### Error Shape (always)

```json
{
  "success": false,
  "error": "Human-readable message"
}
```

The iOS Shortcut checks `success` and shows either `summary` or `error` as a notification.

## Env Bindings

### `Env` Interface (`src/types.ts`)

```typescript
interface Env {
  // AI Provider
  AI_PROVIDER: string;          // "anthropic" (default) | "workers-ai"
  ANTHROPIC_API_KEY: string;
  ANTHROPIC_BASE_URL: string;   // Zenmux endpoint or direct Anthropic
  ANTHROPIC_MODEL: string;      // default: "claude-haiku-4-5"

  // Workers AI (optional)
  AI: Ai;                       // Cloudflare Workers AI binding
  WORKERS_AI_MODEL: string;     // default: "@cf/meta/llama-3.1-8b-instruct"

  // TickTick
  TICKTICK_CLIENT_ID: string;
  TICKTICK_SECRET: string;

  // Auth
  AUTH_KEY: string;

  // Storage
  TICKTICK_STORE: KVNamespace;
}
```

### wrangler.toml

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
id = "<your-kv-namespace-id>"

[ai]
binding = "AI"
```

Secrets stored via `wrangler secret put` (production) and `.dev.vars` (local).

## Testing Strategy

**Framework:** Vitest with `@cloudflare/vitest-pool-workers`

### Test Layers

1. **Schema tests** — Zod schemas accept/reject expected inputs (single task, multi-task, minimal fields, invalid outputs)
2. **Service unit tests** — mock external APIs
   - `anthropic.ts`: mock `generateObject()`, verify prompt construction
   - `ticktick.ts`: mock fetch, verify headers/body/base URL
   - `token-manager.ts`: mock KV, verify refresh at 5-min threshold
   - `ai-provider.ts`: verify provider instantiation for both configs
3. **Route integration tests** — full request/response with mocked services
   - `POST /api/task`: happy path (single + multi), auth failure, LLM failure, partial TickTick failure
   - `POST /api/projects`: cache refresh
   - `GET /health`: returns 200
4. **Middleware tests** — auth validation, timing-safe comparison

### Not Tested (manual/iterative)

- OAuth login/callback flow (one-time setup)
- LLM output quality (prompt tuning)

## iOS Shortcut Design

1. **Dictate Text** — Language: Auto, Stop: After Pause → output `Spoken`
2. **Get Current Date** → format as timezone identifier → output `TZ`
3. **URL** — `https://your-worker.workers.dev/api/task`
4. **Get Contents of URL** — POST with headers `Content-Type: application/json` + `X-Auth-Key: {secret}`, body `{ "text": Spoken, "timezone": TZ }`
5. **Get Dictionary from Input** — extract `success`, `summary`, `error`
6. **If success = true** → Show Notification with `summary`; Otherwise → Show Notification with `error`

Bind to: Settings → Action Button → Shortcut → select this Shortcut.

## File Structure

```
src/
├── index.ts               # Hono app, route registration
├── types.ts               # Env bindings interface
├── routes/
│   ├── task.ts            # POST /api/task (main orchestration)
│   ├── projects.ts        # POST /api/projects (refresh cache)
│   ├── auth.ts            # GET /auth/login + /auth/callback (OAuth)
│   └── health.ts
├── services/
│   ├── ai-provider.ts     # Provider factory (anthropic / workers-ai)
│   ├── ticktick.ts        # TickTick API: create task, list projects
│   └── token-manager.ts   # KV-backed OAuth token read/refresh/write
├── middleware/
│   ├── auth.ts            # X-Auth-Key validation (timing-safe)
│   └── error-handler.ts
├── prompts/
│   └── task-parser.ts     # LLM system prompt (injects time, projects, priority rules)
└── schemas/
    └── task.ts            # Zod schemas for request, LLM output, response
```
