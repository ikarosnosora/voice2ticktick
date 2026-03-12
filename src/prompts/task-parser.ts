import { DEFAULT_TIMEZONE } from "../schemas/task";

interface PromptContext {
  timezone: string;
  projectNames: string[];
}

function resolveTimeZone(timezone: string): string {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const timeZone = resolveTimeZone(ctx.timezone);
  const now = new Date().toLocaleString("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const projectList =
    ctx.projectNames.length > 0
      ? ctx.projectNames.map((name) => `- ${name}`).join("\n")
      : "- (no projects, leave projectName empty)";

  return `You are a task parser. Convert voice input into structured tasks.

Current time: ${now} (timezone: ${timeZone})

User project names:
${projectList}

Instructions:
- Parse the voice input into one or more tasks. If the input contains multiple tasks, return them as separate items in the tasks array.
- Extract title, content, startDate, dueDate, isAllDay, priority, projectName, and tags when available.
- Use date format yyyy-MM-dd'T'HH:mm:ss+ZZZZ, for example 2026-03-12T15:00:00+0800.
- If a task has no explicit time, set isAllDay to true and use midnight in the user's timezone.
- Infer priority from context.
  - Explicit urgency words like 重要, 紧急, urgent, emergency, ASAP should map to 3 or 5.
  - Implicit urgency such as medical appointments, tight deadlines, or critical work can increase priority.
  - Default to 0 when no urgency is present.
  - Valid priority values are 0, 1, 3, and 5.
- projectName must match one of the project names listed above exactly. If there is no clear match, omit projectName.
- Support multiple tasks in a single input, but return at most 5 tasks.`;
}
