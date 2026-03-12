# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Local dev with Wrangler
pnpm test         # Run tests once
pnpm test:watch   # Run tests in watch mode
pnpm deploy       # Deploy to Cloudflare Workers
```

Run a single test file:
```bash
pnpm vitest run test/services/ai-provider.test.ts
```

## Architecture

**Voice → AI → TickTick pipeline** running on Cloudflare Workers (Hono + Zod).

```
iPhone Action Button → iOS Dictate (on-device ASR) → POST /api/tasks → AI parser → TickTick API
```

### Key layers

| Layer | Location | Purpose |
|-------|----------|---------|
| Routes | `src/routes/` | `task.ts` (main), `auth.ts` (OAuth), `projects.ts`, `health.ts` |
| Middleware | `src/middleware/` | `auth.ts` (AUTH_KEY check), `error-handler.ts` |
| Services | `src/services/` | `ai-provider.ts`, `ticktick.ts`, `token-manager.ts` |
| Prompts | `src/prompts/task-parser.ts` | LLM prompt + Zod schema for `generateObject()` |
| Schemas | `src/schemas/task.ts` | Request/response Zod validation |

### AI provider abstraction

`AI_PROVIDER` env var selects the provider at runtime:
- **`anthropic` (default):** `@ai-sdk/anthropic` with `ANTHROPIC_BASE_URL` (supports Zenmux gateway) and `ANTHROPIC_MODEL` (default: `claude-haiku-4-5`)
- **`workers-ai`:** `workers-ai-provider` with `AI` binding, `WORKERS_AI_MODEL` (default: `@cf/meta/llama-3.1-8b-instruct`)

Both use `generateObject()` with the same Zod schema — provider-agnostic downstream.

### OAuth / Token management

TickTick OAuth tokens are stored in Cloudflare KV (`TICKTICK_STORE`). `token-manager.ts` handles storage and refresh. The auth flow is initiated via `POST /auth/login`.

### Priority values

TickTick uses non-standard priority integers: `0` (none), `1` (low), `3` (medium), `5` (high).

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `AUTH_KEY` | Yes | Shared secret for request auth |
| `ANTHROPIC_API_KEY` | If anthropic provider | API key |
| `ANTHROPIC_BASE_URL` | No | Custom gateway (e.g. Zenmux); defaults to `https://api.anthropic.com` |
| `ANTHROPIC_MODEL` | No | Model override; default `claude-haiku-4-5` |
| `WORKERS_AI_MODEL` | No | Workers AI model override |
| `AI_PROVIDER` | No | `anthropic` (default) or `workers-ai` |
| `TICKTICK_CLIENT_ID` | Yes | TickTick OAuth client ID |
| `TICKTICK_SECRET` | Yes | TickTick OAuth client secret |
| `TICKTICK_STORE` | Yes | KV namespace binding |

Set secrets with `wrangler secret put <NAME>`.

## Design spec

Full design doc: `docs/superpowers/specs/2026-03-12-voice2ticktick-design.md`
