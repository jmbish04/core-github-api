/**
 * @file actions.ts
 * @description AI-agent-driven project actions and automated codebase operations.
 * Handles assistant interaction, docstring generation, and landing page previews.
 */

import { Hono } from "hono";
import { getDb } from "@db";
import { fetchProjectContext } from "./utils";
import { generateDocstringsForProject } from "@/automations/pr/doc-string-generator/service";
import { JulesService } from "@/services/jules/service";
import { createPlanningRequest, updatePlanningRequest } from "@/services/planning/store";
import { broadcastPlanningEvent } from "@/services/planning/monitor";
import { PlanningRequestInputSchema } from "@/lib/schemas/jules";

const app = new Hono<{ Bindings: Env }>();

/**
 * POST /:id/assistant
 * Dispatches an engineering task to the Project Assistant Agent.
 */
app.post("/:id/assistant", async (c) => {
  const db = getDb(c.env.DB);
  const projectId = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as { prompt?: string };
  // Logic for runner, agent creation, and plan saving...
  return c.json({ success: true, message: "Handled by Assistant Agent (Mock)" });
});

/**
 * POST /:id/jules/dispatch
 * Direct handoff of a technical task to the Jules agent session.
 */
app.post("/:id/jules/dispatch", async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json() as any;
  const ctx = await fetchProjectContext(db, c.req.param("id"));
  if (!ctx) return c.json({ error: "Context missing" }, 404);

  const jules = JulesService.getInstance(c.env);
  const session = await jules.startSession({
    prompt: body.prompt,
    repo: { owner: ctx.repoOwner!, repo: ctx.repoName! }
  });

  return c.json({ success: true, sessionId: session.id });
});

/**
 * POST /:id/docstrings/generate
 * Automatically generates AI-powered docstrings for repository files.
 */
app.post("/:id/docstrings/generate", async (c) => {
    const db = getDb(c.env.DB);
    const ctx = await fetchProjectContext(db, c.req.param("id"));
    if (!ctx) return c.json({ error: "Context missing" }, 404);

    const body = await c.req.json() as any;
    const result = await generateDocstringsForProject(
      c.env,
      ctx.repoOwner!,
      ctx.repoName!,
      body.files || [],
    );
    return c.json({ success: true, ...result });
});

/**
 * POST /:id/planning/request
 * Convenience wrapper to create a planning request from a project context.
 */
app.post("/:id/planning/request", async (c) => {
  const db = getDb(c.env.DB);
  const projectId = c.req.param("id");
  const ctx = await fetchProjectContext(db, projectId);
  if (!ctx) {
    return c.json({ error: "Context missing" }, 404);
  }

  const body = PlanningRequestInputSchema.parse(await c.req.json());
  const requestId = crypto.randomUUID();
  const githubRepo =
    body.githubRepo || (ctx.repoOwner && ctx.repoName ? `${ctx.repoOwner}/${ctx.repoName}` : undefined);

  const request = await createPlanningRequest(c.env, {
    ...body,
    requestId,
    projectId,
    projectName: body.projectName || ctx.projectName || undefined,
    githubRepo,
    createdBy: c.req.header("x-user-id") || "frontend-project",
  });

  const instance = await c.env.PLANNING_ORCHESTRATOR.create({
    id: requestId,
    params: {
      ...body,
      requestId,
      projectId,
      projectName: body.projectName || ctx.projectName || undefined,
      githubRepo,
    },
  });

  await updatePlanningRequest(c.env, requestId, {
    workflowInstanceId: instance.id,
  });

  await broadcastPlanningEvent(c.env, requestId, {
    source: "api",
    type: "STATUS",
    status: "queued",
    title: "Project planning request created",
    message: "Workflow instance queued from project context.",
  });

  return c.json({
    success: true,
    requestId,
    request,
    workflowInstanceId: instance.id,
    planningUrl: `/api/planning/${requestId}`,
  });
});

export default app;
