/**
 * @file actions.ts
 * @description AI-agent-driven project actions and automated codebase operations.
 * Handles assistant interaction, docstring generation, and landing page previews.
 */

import { Hono } from "hono";
import { z } from "zod";
import { generateStructuredResponse } from "@/ai/providers";
import { getDb } from "@db";
import { fetchProjectContextByOwnerRepo } from "./utils";
import { generateDocstringsForProject } from "@/automations/pr/doc-string-generator/service";
import { JulesService } from "@/services/jules/service";
import { createPlanningRequest, updatePlanningRequest } from "@/services/planning/store";
import { broadcastPlanningEvent } from "@/services/planning/monitor";
import { PlanningRequestInputSchema } from "@/lib/schemas/jules";
import { ReverseEngineeringAuthSchema } from "@/lib/schemas/reverse-engineering";
import { createReverseEngineeringSnapshot } from "@/services/reverse-engineering/store";
import { HoniClient } from '@utils/honi-client';

const app = new Hono<{ Bindings: Env }>();

/**
 * POST /:owner/:repo/assistant
 * Dispatches an engineering task to the Project Assistant Agent.
 */
app.post("/:owner/:repo/assistant", async (c) => {
  const db = getDb(c.env.DB);
  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const ctx = await fetchProjectContextByOwnerRepo(db, owner, repo);
  if (!ctx) return c.json({ success: false, error: "Project not found" }, 404);
  
  const _body = (await c.req.json().catch(() => ({}))) as { prompt?: string };
  if (!_body.prompt) {
    return c.json({ success: false, error: "Prompt is required" }, 400);
  }

  const AssistantSchema = z.object({
    reply: z.string().describe("A conversational reply to the user, answering their request."),
    prd: z.string().optional().describe("A Product Requirements Document if requested by the user, formatted in markdown."),
    planSaved: z.object({
      epicsCreated: z.number(),
      userStoriesCreated: z.number(),
      tasksCreated: z.number()
    }).nullable().optional().describe("If the user requested tasks/issues to be planned, estimate numbers."),
  });

  try {
    const aiResponse = await generateStructuredResponse<z.infer<typeof AssistantSchema>>(
      c.env,
      `You are the Project Assistant for repository ${owner}/${repo}.
      
Project Context:
${JSON.stringify(ctx, null, 2)}

User Request:
${_body.prompt}

Respond thoroughly and carefully.`,
      AssistantSchema
    );

    return c.json({ 
      success: true, 
      reply: aiResponse.reply,
      prd: aiResponse.prd,
      planSaved: aiResponse.planSaved,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * POST /:owner/:repo/jules/dispatch
 * Direct handoff of a technical task to the Jules agent session.
 */
app.post("/:owner/:repo/jules/dispatch", async (c) => {
  const db = getDb(c.env.DB);
  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const body = await c.req.json() as any;
  const ctx = await fetchProjectContextByOwnerRepo(db, owner, repo);
  if (!ctx) return c.json({ error: "Context missing" }, 404);

  const jules = JulesService.getInstance(c.env);
  const session = await jules.startSession({
    prompt: body.prompt,
    repo: { owner: ctx.repoOwner!, repo: ctx.repoName! }
  });

  return c.json({ success: true, sessionId: session.id });
});

/**
 * POST /:owner/:repo/docstrings/generate
 * Automatically generates AI-powered docstrings for repository files.
 */
app.post("/:owner/:repo/docstrings/generate", async (c) => {
    const db = getDb(c.env.DB);
    const owner = c.req.param("owner");
    const repo = c.req.param("repo");
    const ctx = await fetchProjectContextByOwnerRepo(db, owner, repo);
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
 * POST /:owner/:repo/planning/request
 * Convenience wrapper to create a planning request from a project context.
 */
app.post("/:owner/:repo/planning/request", async (c) => {
  const db = getDb(c.env.DB);
  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const ctx = await fetchProjectContextByOwnerRepo(db, owner, repo);
  if (!ctx) {
    return c.json({ error: "Context missing" }, 404);
  }
  const projectId = ctx.projectId;

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

/**
 * POST /:owner/:repo/reverse-engineering/request
 * Convenience wrapper to create a reverse engineering snapshot from project context.
 */
app.post("/:owner/:repo/reverse-engineering/request", async (c) => {
  const db = getDb(c.env.DB);
  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const ctx = await fetchProjectContextByOwnerRepo(db, owner, repo);
  if (!ctx || !ctx.repoOwner || !ctx.repoName) {
    return c.json({ success: false, error: "Project repository context missing" }, 404);
  }
  const projectId = ctx.projectId;

  const body = (await c.req.json().catch(() => ({}))) as {
    branch?: string;
    frontendUrl?: string;
    auth?: unknown;
    useSandboxPreview?: boolean;
    title?: string;
  };
  const auth = body.auth ? ReverseEngineeringAuthSchema.parse(body.auth) : undefined;

  const snapshotId = crypto.randomUUID();
  const repoUrl = ctx.repoUrl || `https://github.com/${ctx.repoOwner}/${ctx.repoName}`;
  const snapshot = await createReverseEngineeringSnapshot(c.env, {
    snapshotId,
    projectId,
    githubOwner: ctx.repoOwner,
    githubRepo: ctx.repoName,
    repoUrl,
    branch: body.branch || "main",
    frontendUrl: body.frontendUrl,
    auth,
    title: body.title || `${ctx.repoOwner}/${ctx.repoName}`,
    useSandboxPreview: body.useSandboxPreview ?? true,
  });

  await HoniClient.fetch(c.env.HONI_ORCHESTRATOR, snapshotId, "/run", {
    method: "POST",
    body: JSON.stringify({
      snapshotId,
      projectId,
      owner: ctx.repoOwner,
      repo: ctx.repoName,
      repoUrl,
      branch: body.branch || "main",
      frontendUrl: body.frontendUrl,
      auth,
      useSandboxPreview: body.useSandboxPreview ?? true,
      title: body.title || `${ctx.repoOwner}/${ctx.repoName}`,
    }),
  });

  return c.json({
    success: true,
    snapshotId,
    snapshot,
    detailUrl: `/api/reverse-engineering/snapshots/${snapshotId}`,
  });
});

export default app;
