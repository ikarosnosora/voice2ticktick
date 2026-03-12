# voice2ticktick

Turn voice memos into TickTick tasks. Speak into your iPhone, get structured tasks created automatically.

```
iPhone Action Button → iOS Dictate (on-device ASR) → Cloudflare Worker → AI parser → TickTick API
```

## How it works

1. Press the iPhone Action Button and dictate one or more tasks
2. iOS sends the transcribed text to a Cloudflare Worker via HTTP
3. An AI model (Claude or Llama) parses the text into structured task data
4. Tasks are created in TickTick with titles, due dates, priorities, projects, and tags

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/)
- A [Cloudflare](https://cloudflare.com/) account
- A [TickTick](https://developer.ticktick.com/) OAuth app (client ID + secret)
- An [Anthropic](https://console.anthropic.com/) API key (if using Claude)

### Install

```bash
pnpm install
```

### Configure

1. Copy `.dev.vars.example` to `.dev.vars` and fill in your keys:

```bash
cp .dev.vars.example .dev.vars
```

2. Create a KV namespace and update `wrangler.toml`:

```bash
wrangler kv namespace create TICKTICK_STORE
# Copy the output ID into wrangler.toml
```

3. Set production secrets:

```bash
wrangler secret put AUTH_KEY
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put TICKTICK_CLIENT_ID
wrangler secret put TICKTICK_SECRET
```

### Authorize TickTick

After deploying, visit `https://your-worker.workers.dev/auth/login` to complete the OAuth flow.

## Development

```bash
pnpm dev          # Local dev server
pnpm test         # Run tests
pnpm test:watch   # Watch mode
pnpm deploy       # Deploy to Cloudflare Workers
```

## API

### `POST /api/task`

Create tasks from voice text. Requires `X-Auth-Key` header.

```bash
curl -X POST https://your-worker.workers.dev/api/task \
  -H "Content-Type: application/json" \
  -H "X-Auth-Key: your-auth-key" \
  -d '{"text": "Tomorrow 3pm dentist appointment, high priority"}'
```

Response:

```json
{
  "success": true,
  "summary": "Created 1 task",
  "tasks": [{ "id": "...", "title": "Dentist appointment" }],
  "failed": []
}
```

### `POST /api/projects`

List or refresh cached TickTick projects. Requires `X-Auth-Key` header.

### `GET /health`

Health check (no auth required).

## AI Providers

Set `AI_PROVIDER` in `wrangler.toml`:

| Provider | Value | Model default |
|----------|-------|---------------|
| Anthropic | `anthropic` | `claude-haiku-4-5` |
| Workers AI | `workers-ai` | `@cf/meta/llama-3.1-8b-instruct` |

## Tech stack

- [Cloudflare Workers](https://workers.cloudflare.com/) - Runtime
- [Hono](https://hono.dev/) - Web framework
- [Zod](https://zod.dev/) - Schema validation
- [Vercel AI SDK](https://sdk.vercel.ai/) - AI provider abstraction
- [Cloudflare KV](https://developers.cloudflare.com/kv/) - Token storage
