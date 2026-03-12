import { z } from "zod";

const dateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{4}$/;

function isValidDate(value: string): boolean {
  return !isNaN(new Date(value).getTime());
}

export const DEFAULT_TIMEZONE = "Asia/Singapore";

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
  startDate: z.string().regex(dateTimeRegex).refine(isValidDate, { message: "Invalid date" }).optional(),
  dueDate: z.string().regex(dateTimeRegex).refine(isValidDate, { message: "Invalid date" }).optional(),
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
    tasks: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
      }).passthrough(),
    ),
    failed: z.array(
      z.object({
        title: z.string(),
        error: z.string(),
      }),
    ),
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
  }),
]);

export type TaskResponse = z.infer<typeof ResponseSchema>;
