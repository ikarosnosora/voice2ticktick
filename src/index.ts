import { Hono } from "hono";
import { authMiddleware } from "./middleware/auth";
import { errorHandler } from "./middleware/error-handler";
import { authRoutes } from "./routes/auth";
import { healthRoute } from "./routes/health";
import { projectsRoute } from "./routes/projects";
import { taskRoute } from "./routes/task";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.onError(errorHandler);
app.use("/api/*", authMiddleware);
app.use("/auth/login", authMiddleware);

app.route("/", healthRoute);
app.route("/", taskRoute);
app.route("/", projectsRoute);
app.route("/", authRoutes);

export default app;
