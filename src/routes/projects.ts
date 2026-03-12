import { Hono } from "hono";
import { TickTickClient } from "../services/ticktick";
import { TokenManager } from "../services/token-manager";
import type { Env } from "../types";

export const projectsRoute = new Hono<{ Bindings: Env }>();

projectsRoute.post("/api/projects", async (c) => {
  const tokenManager = new TokenManager(
    c.env.TICKTICK_STORE,
    c.env.TICKTICK_CLIENT_ID,
    c.env.TICKTICK_SECRET,
  );
  const token = await tokenManager.getValidToken();
  const client = new TickTickClient(token);
  const projects = await client.getProjects(c.env.TICKTICK_STORE, true);

  return c.json({ success: true, projects });
});
