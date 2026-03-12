import { describe, expect, it } from "vitest";
import { createModel } from "../../src/services/ai-provider";

describe("createModel", () => {
  it("returns anthropic model by default", () => {
    const model = createModel({
      AI_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "sk-test",
      ANTHROPIC_BASE_URL: "https://api.anthropic.com",
      ANTHROPIC_MODEL: "claude-haiku-4-5",
    } as never);

    expect(model).toBeDefined();
    expect((model as { modelId: string }).modelId).toContain("claude-haiku-4-5");
  });

  it("returns anthropic model when AI_PROVIDER is empty", () => {
    const model = createModel({
      ANTHROPIC_API_KEY: "sk-test",
      ANTHROPIC_BASE_URL: "",
      ANTHROPIC_MODEL: "claude-haiku-4-5",
    } as never);

    expect(model).toBeDefined();
  });

  it("returns workers-ai model when configured", () => {
    const model = createModel({
      AI_PROVIDER: "workers-ai",
      AI: {},
      WORKERS_AI_MODEL: "@cf/meta/llama-3.1-8b-instruct",
    } as never);

    expect(model).toBeDefined();
  });
});
