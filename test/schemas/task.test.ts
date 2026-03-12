import { describe, expect, it } from "vitest";
import {
  RequestSchema,
  ResponseSchema,
  TaskArraySchema,
} from "../../src/schemas/task";

describe("RequestSchema", () => {
  it("accepts valid request with text and timezone", () => {
    const result = RequestSchema.safeParse({
      text: "明天开会",
      timezone: "Asia/Singapore",
    });

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
    const result = RequestSchema.safeParse({
      text: "明天开会",
      timezone: "Mars/Olympus",
    });
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
      tasks: [
        {
          title: "Review design",
          content: "PBA benchmark",
          startDate: "2026-03-12T15:00:00+0800",
          dueDate: "2026-03-12T17:00:00+0800",
          isAllDay: false,
          priority: 3,
          projectName: "工作",
          tags: ["review"],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts multiple tasks up to 5", () => {
    const tasks = Array.from({ length: 5 }, (_, index) => ({
      title: `Task ${index + 1}`,
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
    const tasks = Array.from({ length: 6 }, (_, index) => ({
      title: `Task ${index + 1}`,
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
      tasks: [
        { title: "Test", priority: 0, dueDate: "2026-03-12T15:00:00+0800" },
      ],
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
