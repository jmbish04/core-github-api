import { Hono } from "hono";
import { z } from "zod";
import { createAgent } from "@/ai/agents/honi";
import { buildMaxAgentMemory } from "@/ai/agents/memory";
import { PlanningWorkstreamSchema } from "@/lib/schemas/jules";
import {
  derivePlanBreakdownFromMarkdown,
  persistPlanBreakdown,
} from "@/services/planning/honi-babysitter";

const PlanningOrchestrationRequestSchema = z.object({
  requestId: z.string(),
  workstream: PlanningWorkstreamSchema,
  markdown: z.string().min(1),
  projectId: z.string().optional(),
  projectName: z.string().optional(),
});

export const { Agent, handler } = createAgent<Env>({
  name: "planning-orchestrator-agent",
  model: "claude-sonnet-4-5",
  system: [
    "You convert approved planning markdown into concrete epics, stories, and tasks.",
    "You enrich plans with Cloudflare implementation detail and persist normalized planning output.",
  ].join(" "),
  binding: "PLANNING_ORCHESTRATOR_AGENT",
  tools: [],
  memory: buildMaxAgentMemory({
    agentName: "PlanningOrchestratorAgent",
    semanticBinding: "PLAN_EMBEDDINGS",
    graphId: "core-github-api-planning-orchestrator",
  }),
  observability: { enabled: true, aiGatewaySlug: "core-github-api", collectEvents: true },
});

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ status: "ok", agent: "PlanningOrchestratorAgent" }));
app.get("/docs", (c) => c.text("Planning Orchestrator Agent API"));
app.get("/context", (c) => c.json({ environment: "Cloudflare Workers", agent: "PlanningOrchestratorAgent" }));
app.get("/openapi.json", (c) =>
  c.json({
    openapi: "3.1.0",
    info: { title: "PlanningOrchestratorAgent", version: "1.0.0" },
    paths: {},
  }),
);

app.post("/breakdown", async (c) => {
  const payload = PlanningOrchestrationRequestSchema.parse(await c.req.json());
  const breakdown = await derivePlanBreakdownFromMarkdown(c.env, payload);
  return c.json({ success: true, breakdown });
});

app.post("/orchestrate", async (c) => {
  const payload = PlanningOrchestrationRequestSchema.parse(await c.req.json());
  const breakdown = await derivePlanBreakdownFromMarkdown(c.env, payload);
  await persistPlanBreakdown(c.env, payload, breakdown);
  return c.json({ success: true, breakdown });
});

app.all("/*", (c) => handler.fetch(c.req.raw, c.env, c.executionCtx));

export default app;
export class PlanningOrchestratorAgent extends Agent {}
