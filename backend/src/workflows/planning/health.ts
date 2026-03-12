import { getAgentByName } from "@/ai/agents/runtime/agents";
import { HealthStepResult } from "@/health/types";
import { getDb, projectPlanningRequests } from "@db";
import { count } from "drizzle-orm";

function getVectorizeDimensions(info: { dimensions?: number; config?: Record<string, unknown> }) {
  const config = info.config || {};
  return info.dimensions ?? (typeof config.dimensions === "number" ? config.dimensions : undefined);
}

function getVectorizeMetric(info: { metric?: string; config?: Record<string, unknown> }) {
  const config = info.config || {};
  return info.metric ?? (typeof config.metric === "string" ? config.metric : undefined);
}

export async function checkHealth(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  const subChecks: Record<string, any> = {};

  const runCheck = async (name: string, fn: () => Promise<Record<string, unknown>>) => {
    const checkStart = Date.now();
    try {
      const result = await fn();
      subChecks[name] = { status: "OK", latency: Date.now() - checkStart, ...result };
    } catch (error) {
      subChecks[name] = {
        status: "FAILURE",
        latency: Date.now() - checkStart,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  await runCheck("database", async () => {
    const db = getDb(env.DB);
    const [result] = await db.select({ value: count() }).from(projectPlanningRequests);
    return {
      message: "planning_requests schema accessible",
      rowCount: result?.value || 0,
    };
  });

  await runCheck("workflow", async () => {
    if (!env.PLANNING_ORCHESTRATOR) {
      throw new Error("PLANNING_ORCHESTRATOR binding missing");
    }

    const instance = await env.PLANNING_ORCHESTRATOR.get("planning-health-probe");
    const status = await instance.status();
    return {
      message: "Planning workflow binding reachable",
      instanceStatus: status.status,
    };
  });

  await runCheck("monitor", async () => {
    if (!env.PLANNING_MONITOR) {
      throw new Error("PLANNING_MONITOR binding missing");
    }

    const id = env.PLANNING_MONITOR.idFromName("planning-health-probe");
    const stub = env.PLANNING_MONITOR.get(id);
    const response = await stub.fetch("http://planning/internal/snapshot");

    if (!response.ok) {
      throw new Error(`Planning monitor returned HTTP ${response.status}`);
    }

    const snapshot = (await response.json()) as { status?: string };
    return {
      message: "Planning monitor Durable Object reachable",
      latestStatus: snapshot.status || "unknown",
    };
  });

  await runCheck("artifacts", async () => {
    if (!env.PLAN_ARTIFACTS) {
      throw new Error("PLAN_ARTIFACTS binding missing");
    }

    const listing = await env.PLAN_ARTIFACTS.list({ prefix: "planning/", limit: 1 });
    return {
      message: "Planning artifacts bucket accessible",
      previewCount: listing.objects.length,
      truncated: listing.truncated,
    };
  });

  await runCheck("embeddings", async () => {
    if (!env.PLAN_EMBEDDINGS) {
      throw new Error("PLAN_EMBEDDINGS binding missing");
    }

    const info = await env.PLAN_EMBEDDINGS.describe();
    return {
      message: "Planning embeddings index accessible",
      dimensions: getVectorizeDimensions(info),
      metric: getVectorizeMetric(info),
    };
  });

  await runCheck("planner", async () => {
    if (!env.PLANNER) {
      throw new Error("PLANNER binding missing");
    }

    const stub = await getAgentByName(env.PLANNER, "planning-health-probe") as {
      fetch(input: RequestInfo | URL): Promise<Response>;
    };
    const response = await stub.fetch("http://planner/health");

    if (!response.ok) {
      throw new Error(`Planner agent returned HTTP ${response.status}`);
    }

    const payload = (await response.json()) as { agent?: string; status?: string };
    return {
      message: "Planner agent reachable",
      agent: payload.agent || "PlannerAgent",
      agentStatus: payload.status || "unknown",
    };
  });

  const hasFailure = Object.values(subChecks).some(
    (check: any) => check.status === "FAILURE",
  );

  return {
    name: "Planning Orchestration",
    status: hasFailure ? "failure" : "success",
    message: hasFailure
      ? "One or more planning dependencies failed"
      : "All planning dependencies healthy",
    durationMs: Date.now() - start,
    details: subChecks,
  };
}
