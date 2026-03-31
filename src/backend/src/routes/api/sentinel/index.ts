/**
 * @file backend/src/routes/api/sentinel/index.ts
 * @description Sentinel API router — aggregates task, insight, orchestration,
 * and health endpoints under /api/sentinel.
 *
 * Auth: Requires AGENTIC_WORKER_API_KEY or WORKER_API_KEY via x-api-key header.
 *
 * @module Routes/Sentinel
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { getWorkerApiKey, getAgenticWorkerApiKey } from "@utils/secrets";
import tasksApi from "./tasks";
import insightsApi from "./insights";
import orchestrateApi from "./orchestrate";
import healthApi from "./health";

const sentinelApi = new OpenAPIHono<{ Bindings: Env }>();

sentinelApi.use("*", cors({ origin: "*", allowMethods: ["GET", "POST", "PATCH", "OPTIONS"] }));

// ─── Auth Middleware ─────────────────────────────────────────────────────────

sentinelApi.use("*", async (c, next) => {
  // Health endpoints are public
  if (c.req.path.endsWith("/health/learning")) {
    return next();
  }

  const key =
    c.req.header("x-api-key") ??
    c.req.header("authorization")?.replace("Bearer ", "");

  if (!key) {
    return c.json({ error: "Missing API key" }, 401);
  }

  const [workerKey, agenticKey] = await Promise.all([
    getWorkerApiKey(c.env),
    getAgenticWorkerApiKey(c.env),
  ]);

  if (key !== workerKey && key !== agenticKey) {
    return c.json({ error: "Invalid API key" }, 403);
  }

  return next();
});

// ─── Mount Sub-Routes ────────────────────────────────────────────────────────

sentinelApi.route("/", tasksApi);
sentinelApi.route("/", insightsApi);
sentinelApi.route("/", orchestrateApi);
sentinelApi.route("/", healthApi);

export default sentinelApi;
