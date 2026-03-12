# Voice2TickTick Implementation Plan

## Context

Build a system that lets you press the iPhone Action Button, speak a task in natural language (Chinese), and have it automatically parsed by Claude and created in TickTick. The architecture is documented in `voice-ticktick-architecture.jsx`. Currently **no implementation code exists** — only that design artifact.

**Flow:** iPhone Action Button → iOS Dictate → Cloudflare Worker → Claude API (NLP) → TickTick API → notification back to iPhone

---

## Tech Stack

- **Runtime:** Cloudflare Workers (TypeScript)
- **Framework:** Hono (clean routing, middleware, ~14KB)
- **Validation:** Zod (validate LLM output before sending to TickTick)
- **Storage:** Cloudflare KV (OAuth tokens, project cache)
- **LLM:** Anthropic API via raw `fetch` (no SDK — single POST, keeps bundle small)
- **Default model:** `claude-haiku-4-5` (~$0.001/call), configurable via `ANTHROPIC_MODEL` env var
- **Testing:** Vitest + `@cloudflare/vitest-pool-workers`

---

## File Structure

```
voice2ticktick/
├── package.json
├── tsconfig.json
├── wrangler.toml              # KV bindings, secrets ref
├── .dev.vars                  # Local secrets (gitignored)
├── .gitignore
├── vitest.config.ts
├── voice-ticktick-architecture.jsx  # (existing)
│
├── src/
│   ├── index.ts               # Hono app, route registration
│   ├── types.ts               # Env bindings interface
│   ├── routes/
│   │   ├── task.ts            # POST /api/task (main route)
│   │   ├── projects.ts        # POST /api/projects (refresh cache)
│   │   ├── auth.ts            # GET /auth/login + /auth/callback (OAuth)
│   │   └── health.ts          # GET /health
│   ├── services/
│   │   ├── anthropic.ts       # Claude API: voice text → structured JSON
│   │   ├── ticktick.ts        # TickTick API: create task, list projects
│   │   └── token-manager.ts   # KV token read/refresh/write
│   ├── middleware/
│   │   ├── auth.ts            # X-Auth-Key validation (timing-safe)
│   │   └── error-handler.ts   # Global error → JSON response
│   ├── prompts/
│   │   └── task-parser.ts     # LLM system prompt template
│   └── schemas/
│       └── task.ts            # Zod schemas for request, LLM output, response
│
└── test/
    ├── routes/task.test.ts
    ├── services/anthropic.test.ts
    └── fixtures/
        └── voice-inputs.json  # Sample Chinese voice inputs
```

---

## Implementation Phases

### Phase 1: Scaffolding
**Files:** `package.json`, `tsconfig.json`, `wrangler.toml`, `.gitignore`, `.dev.vars`, `src/types.ts`, `src/index.ts`

- Init project with `pnpm init`, install `hono`, `zod`, dev deps (`wrangler`, `@cloudflare/workers-types`, `vitest`)
- Define `Env` interface: `TICKTICK_STORE` (KVNamespace), `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `TICKTICK_CLIENT_ID`, `TICKTICK_SECRET`, `AUTH_KEY`, optional `ANTHROPIC_MODEL`
- Create Hono app skeleton with route mounting

### Phase 2: Auth Layer
**Files:** `src/middleware/auth.ts`, `src/services/token-manager.ts`, `src/routes/auth.ts`

- **Auth middleware:** Validate `X-Auth-Key` header using `crypto.subtle.timingSafeEqual`, return 401 if invalid. Applied to `/api/*` only.
- **Token manager:** `getValidToken(env)` reads KV keys (`ticktick_access_token`, `ticktick_refresh_token`, `ticktick_token_expires_at`). If within 5min of expiry, POST `https://ticktick.com/oauth/token` with `grant_type=refresh_token` and store new tokens in KV.
- **OAuth routes:** `GET /auth/login` redirects to TickTick authorize URL. `GET /auth/callback` exchanges code for tokens, stores in KV, shows success HTML.

### Phase 3: TickTick Service + Project Cache
**Files:** `src/services/ticktick.ts`, `src/routes/projects.ts`, `src/schemas/task.ts`

- `createTask(token, task)` → POST `https://api.ticktick.com/open/v1/task`
- `getProjects(token)` → GET `https://api.ticktick.com/open/v1/project`
- Project cache in KV with 24h TTL (`project_list`, `project_list_updated_at`)
- `POST /api/projects` forces refresh
- Zod schemas: `TaskRequestSchema` (input), `LLMOutputSchema` (LLM result validation)

### Phase 4: LLM Integration
**Files:** `src/services/anthropic.ts`, `src/prompts/task-parser.ts`

- **System prompt** injects: current time (Asia/Shanghai +08:00), project list, JSON output schema, priority rules (重要→3, 非常重要→5, 不重要→1), date parsing rules, project fuzzy matching guidance
- **Anthropic service:** raw `fetch` to `${ANTHROPIC_BASE_URL}/v1/messages` (defaults to `https://api.anthropic.com`), extract text content, strip any markdown fences, `JSON.parse`, validate with `LLMOutputSchema`
- Handle malformed LLM output gracefully (return error, don't crash)

### Phase 5: Main Task Route (Orchestration)
**Files:** `src/routes/task.ts`, `src/middleware/error-handler.ts`, `src/routes/health.ts`

`POST /api/task` flow:
1. Validate request body (`{ "text": "..." }`)
2. Get valid TickTick token (auto-refresh if needed)
3. Get project list (from cache or refresh if >24h)
4. Build LLM prompt with current time + projects
5. Call Claude API → parse voice text → structured JSON
6. Validate LLM output with Zod
7. Call TickTick API to create task
8. Return `{ success, title, dueDate, project, priority }`

Error handler middleware maps errors to appropriate HTTP status codes (400/401/502/500).

### Phase 6: Testing
**Files:** `vitest.config.ts`, test files

- Unit tests for anthropic service (prompt construction, JSON parsing, Zod validation)
- Unit tests for token manager (refresh logic, KV interactions)
- Integration tests for task route (full flow with mocked external APIs)
- Fixtures with realistic Chinese voice inputs

---

## Error Handling

| Layer | Error | HTTP | Response |
|-------|-------|------|----------|
| Auth middleware | Bad/missing X-Auth-Key | 401 | `{"success":false,"error":"Unauthorized"}` |
| Input | Missing `text` field | 400 | `{"success":false,"error":"text is required"}` |
| Token | No token in KV | 500 | `{"success":false,"error":"Not authorized. Visit /auth/login"}` |
| Token | Refresh fails | 500 | `{"success":false,"error":"Token refresh failed"}` |
| LLM | API error or bad JSON | 502 | `{"success":false,"error":"Failed to parse voice input"}` |
| TickTick | API error | 502 | `{"success":false,"error":"TickTick API error"}` |

---

## Environment Variables / Secrets

| Variable | Type | Description |
|----------|------|-------------|
| `ANTHROPIC_API_KEY` | Secret | `sk-ant-...` |
| `TICKTICK_CLIENT_ID` | Secret | From developer.ticktick.com |
| `TICKTICK_SECRET` | Secret | From developer.ticktick.com |
| `AUTH_KEY` | Secret | Custom key for iOS Shortcut auth |
| `ANTHROPIC_BASE_URL` | Secret | Anthropic API endpoint URL (default: `https://api.anthropic.com`) — for 3rd party proxy or custom API gateway access |
| `TICKTICK_STORE` | KV Binding | KV namespace for tokens/cache |
| `ANTHROPIC_MODEL` | Var (optional) | Default: `claude-haiku-4-5` |

---

## Verification

1. **Local dev:** `pnpm wrangler dev` → test with `curl -X POST http://localhost:8787/api/task -H "X-Auth-Key: test" -H "Content-Type: application/json" -d '{"text":"明天下午三点开会"}'`
2. **OAuth flow:** Visit `http://localhost:8787/auth/login` in browser, complete TickTick authorization, verify tokens stored in KV
3. **Health check:** `curl http://localhost:8787/health`
4. **Tests:** `pnpm test`
5. **Deploy:** `pnpm wrangler deploy`, test with production URL
6. **iOS Shortcut:** Create shortcut per architecture doc, test with Action Button
