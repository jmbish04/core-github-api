import { Hono } from "hono";
import { z } from "zod";
import { createAgent } from "@/ai/agents/honi";
import { buildMaxAgentMemory } from "@/ai/agents/memory";
import { PlanningWorkstreamSchema } from "@/lib/schemas/jules";
import { buildPlanningMarkdown } from "@/services/planning/honi-babysitter";

const MaterializePlanningRequestSchema = z.object({
  requestId: z.string(),
  workstream: PlanningWorkstreamSchema,
  prompt: z.string(),
  githubRepo: z.string().optional(),
  baseBranch: z.string().optional(),
  capture: z.any(),
  result: z.any().nullable().optional(),
  failureMessage: z.string().nullable().optional(),
});

export const { Agent, handler } = createAgent<Env>({
  name: "planning-supervisor",
  model: "claude-sonnet-4-5",
  system: [
    "You supervise Jules-backed planning requests.",
    "You materialize high-signal markdown plans and preserve complete execution context.",
    "Favor precise operational summaries over generic prose.",
  ].join(" "),
  binding: "PLANNING_SUPERVISOR",
  tools: [],
  memory: buildMaxAgentMemory({
    agentName: "PlanningSupervisorAgent",
    semanticBinding: "PLAN_EMBEDDINGS",
    graphId: "core-github-api-planning-supervisor",
  }),
  observability: { enabled: true, aiGatewaySlug: "core-github-api", collectEvents: true },
});

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ status: "ok", agent: "PlanningSupervisorAgent" }));
app.get("/docs", (c) => c.text("Planning Supervisor Agent API"));
app.get("/context", (c) => c.json({ environment: "Cloudflare Workers", agent: "PlanningSupervisorAgent" }));
app.get("/openapi.json", (c) =>
  c.json({
    openapi: "3.1.0",
    info: { title: "PlanningSupervisorAgent", version: "1.0.0" },
    paths: {},
  }),
);

app.post("/materialize", async (c) => {
  const payload = MaterializePlanningRequestSchema.parse(await c.req.json());
  const markdown = buildPlanningMarkdown({
    requestId: payload.requestId,
    workstream: payload.workstream,
    prompt: payload.prompt,
    githubRepo: payload.githubRepo,
    baseBranch: payload.baseBranch,
    capture: payload.capture,
    result: payload.result || null,
    failureMessage: payload.failureMessage || null,
  });

  return c.json({ success: true, markdown });
});

app.all("/*", (c) => handler.fetch(c.req.raw, c.env, c.executionCtx));

export default app;
export class PlanningSupervisorAgent extends Agent {}
