import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../../src/prompts/task-parser";

describe("buildSystemPrompt", () => {
  it("includes current time in the given timezone", () => {
    const prompt = buildSystemPrompt({
      timezone: "Asia/Singapore",
      projectNames: ["Work", "Life"],
    });

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
