# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**voice2ticktick** converts iPhone Action Button voice input into TickTick tasks. The flow: iPhone Action Button → iOS Dictate (on-device ASR) → Cloudflare Worker → AI (NLP parsing) → TickTick API → notification feedback.

Design spec is in `docs/superpowers/specs/`. Architecture visualization in `docs/`.

## Development Commands

```bash
# Install dependencies
pnpm install

# Local development (requires .dev.vars with secrets)
pnpm wrangler dev

# Run tests
pnpm test

# Deploy to Cloudflare
pnpm wrangler deploy
```

### Testing a single route locally
```bash
curl -X POST http://localhost:8787/api/task \
  -H "X-Auth-Key: test" \
  -H "Content-Type: application/json" \
  -d '{"text":"明天下午三点开会","timezone":"Asia/Singapore"}'

curl http://localhost:8787/health
```

## Architecture

**Runtime:** Cloudflare Workers (TypeScript) + Hono framework + Zod validation + Cloudflare KV

**AI SDK:** Vercel AI SDK (`ai` + `@ai-sdk/anthropic` + `workers-ai-provider`). Uses `generateObject()` with Zod schema for structured LLM output — no manual JSON parsing needed.

**File structure:**
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

## Key Design Decisions

**AI Provider:** Configurable via `AI_PROVIDER` env var. Default `"anthropic"` uses `@ai-sdk/anthropic` with `ANTHROPIC_BASE_URL` (supports Zenmux or direct Anthropic). `"workers-ai"` uses Cloudflare Workers AI binding.

**LLM output:** `generateObject()` with Zod schema. Multi-task support (one voice input → array of tasks). Priority is fully LLM-inferred from context — explicit signals ("重要", "urgent") and implicit signals (task nature, deadlines) — not hardcoded keyword mapping.

**TickTick API:** Base URL is `https://ticktick.com/open/v1`. OAuth 2.0 tokens stored in Cloudflare KV. Token auto-refresh when `access_token` expires within 5 minutes. The `refresh_token` itself does not expire.

**Project cache:** TickTick project list cached in KV with 24h TTL. The LLM prompt includes the project list for fuzzy-matching project names from voice input.

**Timezone:** Sent by iOS Shortcut from device (e.g. `"Asia/Singapore"`), falls back to `"Asia/Singapore"` if omitted. Supports travel — always uses the device's current timezone.

**Auth middleware:** `X-Auth-Key` header validated with `crypto.subtle.timingSafeEqual` on all `/api/*` routes.

## Environment Variables

| Variable | Type | Description |
|----------|------|-------------|
| `AI_PROVIDER` | Var | `"anthropic"` (default) or `"workers-ai"` |
| `ANTHROPIC_API_KEY` | Secret | `sk-ant-...` |
| `ANTHROPIC_BASE_URL` | Secret | Defaults to `https://api.anthropic.com`; set for Zenmux/custom gateway |
| `ANTHROPIC_MODEL` | Var (optional) | Default: `claude-haiku-4-5` |
| `WORKERS_AI_MODEL` | Var (optional) | Default: `@cf/meta/llama-3.1-8b-instruct` |
| `TICKTICK_CLIENT_ID` | Secret | From developer.ticktick.com |
| `TICKTICK_SECRET` | Secret | From developer.ticktick.com |
| `AUTH_KEY` | Secret | Custom key sent by iOS Shortcut in `X-Auth-Key` header |
| `TICKTICK_STORE` | KV Binding | KV namespace for tokens/cache |
| `AI` | AI Binding | Cloudflare Workers AI (for `workers-ai` provider) |

Store local secrets in `.dev.vars` (gitignored). For production, use `wrangler secret put`.

## One-Time Setup

1. Register app at developer.ticktick.com, set Redirect URI to `https://your-worker.workers.dev/auth/callback`
2. Deploy Worker with KV namespace + secrets configured in `wrangler.toml`
3. Visit `/auth/login` in browser to complete TickTick OAuth → tokens stored in KV automatically
4. Create iOS Shortcut: Dictate Text → get device timezone → POST to `/api/task` with `X-Auth-Key` header + `{"text": ..., "timezone": ...}` → parse JSON response → show notification
