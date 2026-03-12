import { generateObject } from "ai";
import { Hono } from "hono";
import { buildSystemPrompt } from "../prompts/task-parser";
import { RequestSchema, TaskArraySchema } from "../schemas/task";
import { createModel } from "../services/ai-provider";
import { TickTickClient } from "../services/ticktick";
import type { CreateTaskParams } from "../services/ticktick";
import { TokenManager } from "../services/token-manager";
import type { Env } from "../types";

export const taskRoute = new Hono<{ Bindings: Env }>();

type PreparedTask = CreateTaskParams & {
  title: string;
  warnings: string[];
};

taskRoute.post("/api/task", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: "Invalid JSON body" }, 400);
  }

  const parsedRequest = RequestSchema.safeParse(body);
  if (!parsedRequest.success) {
    const timezoneIssue = parsedRequest.error.issues.find(
      (issue) => issue.path[0] === "timezone",
    );
    const textTooLongIssue = parsedRequest.error.issues.find(
      (issue) => issue.path[0] === "text" && issue.code === "too_big",
    );
    const textIssue = parsedRequest.error.issues.find(
      (issue) => issue.path[0] === "text",
    );

    if (timezoneIssue) {
      return c.json({ success: false, error: "Invalid timezone" }, 400);
    }

    if (textTooLongIssue) {
      return c.json(
        { success: false, error: "Text must be 2000 characters or fewer" },
        400,
      );
    }

    if (textIssue) {
      return c.json({ success: false, error: "Text is required" }, 400);
    }

    return c.json({ success: false, error: "Invalid request" }, 400);
  }

  const { text, timezone } = parsedRequest.data;

  const tokenManager = new TokenManager(
    c.env.TICKTICK_STORE,
    c.env.TICKTICK_CLIENT_ID,
    c.env.TICKTICK_SECRET,
  );
  const token = await tokenManager.getValidToken();
  const client = new TickTickClient(token);
  const projects = await client.getProjects(c.env.TICKTICK_STORE);

  let llmResult: Awaited<ReturnType<typeof generateObject<typeof TaskArraySchema>>>;
  try {
    llmResult = await generateObject({
      model: createModel(c.env),
      schema: TaskArraySchema,
      system: buildSystemPrompt({
        timezone,
        projectNames: projects.map((project) => project.name),
      }),
      prompt: text,
    });
  } catch {
    return c.json({ success: false, error: "Failed to parse voice input" }, 502);
  }

  const parsedTasks = llmResult.object.tasks;
  if (parsedTasks.length === 0) {
    return c.json({ success: false, error: "Failed to parse voice input" }, 502);
  }

  let currentProjects = projects;
  let didRefreshProjects = false;
  const tasksWithIds: PreparedTask[] = [];

  for (const task of parsedTasks) {
    let projectId: string | undefined;
    const warnings: string[] = [];

    if (task.projectName) {
      projectId = client.resolveProjectId(task.projectName, currentProjects);
      if (!projectId && !didRefreshProjects) {
        currentProjects = await client.getProjects(c.env.TICKTICK_STORE, true);
        didRefreshProjects = true;
        projectId = client.resolveProjectId(task.projectName, currentProjects);
      }

      if (!projectId) {
        warnings.push(
          `Project "${task.projectName}" was not found; task was created in inbox`,
        );
      }
    }

    const { projectName, ...taskWithoutProjectName } = task;
    void projectName;
    tasksWithIds.push({
      ...taskWithoutProjectName,
      projectId,
      timeZone: timezone,
      warnings,
    });
  }

  const results = await Promise.allSettled(
    tasksWithIds.map(({ warnings, ...task }) => {
      void warnings;
      return client.createTask(task);
    }),
  );

  const succeeded: Array<{
    id: string;
    title: string;
    dueDate?: string;
    project?: string;
    warnings?: string[];
  }> = [];
  const failed: Array<{ title: string; error: string }> = [];

  results.forEach((result, index) => {
    const requestTask = tasksWithIds[index];

    if (result.status === "fulfilled") {
      const projectName = currentProjects.find(
        (project) => project.id === requestTask.projectId,
      )?.name;

      succeeded.push({
        id: result.value.id,
        title: result.value.title,
        dueDate: requestTask.dueDate,
        project: projectName,
        ...(requestTask.warnings.length > 0
          ? { warnings: requestTask.warnings }
          : {}),
      });
      return;
    }

    failed.push({
      title: requestTask.title,
      error:
        result.reason instanceof Error
          ? result.reason.message
          : "Unknown error",
    });
  });

  if (succeeded.length === 0 && failed.length > 0) {
    return c.json({ success: false, error: "Failed to create tasks" }, 502);
  }

  const summary =
    succeeded.length === 1
      ? `已创建: ${succeeded[0].title}`
      : `已创建 ${succeeded.length} 个任务: ${succeeded
          .map((task) => task.title)
          .join(", ")}`;

  return c.json({
    success: true,
    summary: failed.length > 0 ? `${summary} (${failed.length} 个失败)` : summary,
    tasks: succeeded,
    failed,
  });
});
