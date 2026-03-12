import { createAnthropic } from "@ai-sdk/anthropic";
import { createWorkersAI } from "workers-ai-provider";
import type { Env } from "../types";

export function createModel(env: Env) {
  if (env.AI_PROVIDER === "workers-ai") {
    const workersai = createWorkersAI({ binding: env.AI });
    return workersai(
      env.WORKERS_AI_MODEL || "@cf/meta/llama-3.1-8b-instruct",
    );
  }

  const anthropic = createAnthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    baseURL: env.ANTHROPIC_BASE_URL || "https://api.anthropic.com",
  });

  return anthropic(env.ANTHROPIC_MODEL || "claude-haiku-4-5");
}
