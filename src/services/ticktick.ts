const BASE_URL = "https://ticktick.com/open/v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface Project {
  id: string;
  name: string;
}

export interface CreateTaskParams {
  title: string;
  content?: string;
  startDate?: string;
  dueDate?: string;
  isAllDay?: boolean;
  priority: number;
  projectId?: string;
  timeZone?: string;
  tags?: string[];
}

export interface CreatedTask {
  id: string;
  title: string;
  [key: string]: unknown;
}

function invalidProjectResponseError(): Error & { status: number } {
  return Object.assign(new Error("Invalid TickTick project response"), {
    status: 502,
  });
}

function upstreamProjectFetchError(status: number): Error & { status: number } {
  return Object.assign(new Error(`Failed to fetch projects: ${status}`), {
    status: 502,
  });
}

function normalizeProjectsResponse(data: unknown): Project[] {
  if (!Array.isArray(data)) {
    throw invalidProjectResponseError();
  }

  return data.map((project) => {
    if (!project || typeof project !== "object") {
      throw invalidProjectResponseError();
    }

    const { id, name } = project as Record<string, unknown>;
    if (typeof id !== "string" || id.length === 0) {
      throw invalidProjectResponseError();
    }

    if (typeof name !== "string") {
      throw invalidProjectResponseError();
    }

    const normalizedName = name.trim();
    if (normalizedName.length === 0) {
      throw invalidProjectResponseError();
    }

    return {
      id,
      name: normalizedName,
    };
  });
}

export class TickTickClient {
  constructor(private readonly accessToken: string) {}

  async createTask(params: CreateTaskParams): Promise<CreatedTask> {
    const body: Record<string, unknown> = { ...params };
    if (typeof body.isAllDay === "boolean") {
      body.isAllDay = String(body.isAllDay);
    }

    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/task`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw Object.assign(new Error("TickTick API request failed"), { status: 502 });
    }

    if (!res.ok) {
      throw new Error(`TickTick API error: ${res.status}`);
    }

    return (await res.json()) as CreatedTask;
  }

  async getProjects(kv: KVNamespace, forceRefresh = false): Promise<Project[]> {
    if (!forceRefresh) {
      const [cachedProjects, updatedAt] = await Promise.all([
        kv.get("project_list"),
        kv.get("project_list_updated_at"),
      ]);

      if (cachedProjects && updatedAt) {
        const age = Date.now() - Number(updatedAt);
        if (age < CACHE_TTL_MS) {
          try {
            return normalizeProjectsResponse(JSON.parse(cachedProjects));
          } catch {
            // Fall through to refresh if cache content is malformed.
          }
        }
      }
    }

    return this.fetchAndCacheProjects(kv);
  }

  resolveProjectId(
    projectName: string,
    projects: Project[],
  ): string | undefined {
    const normalized = projectName.trim().toLowerCase();
    const match = projects.find((project) => {
      return project.name.trim().toLowerCase() === normalized;
    });

    return match?.id;
  }

  private async fetchAndCacheProjects(kv: KVNamespace): Promise<Project[]> {
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/project`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });
    } catch {
      throw Object.assign(new Error("TickTick project fetch request failed"), { status: 502 });
    }

    if (!res.ok) {
      throw upstreamProjectFetchError(res.status);
    }

    let responseData: unknown;
    try {
      responseData = await res.json();
    } catch {
      throw invalidProjectResponseError();
    }

    const projects = normalizeProjectsResponse(responseData);

    await Promise.all([
      kv.put("project_list", JSON.stringify(projects)),
      kv.put("project_list_updated_at", String(Date.now())),
    ]);

    return projects;
  }
}
