import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { getDb, projectPlanningRequests } from "@db";
import {
  PlanningApprovalInputSchema,
  PlanningRequestInputSchema,
} from "@/lib/schemas/jules";
import {
  buildPlanningArtifactUrls,
  getPlanningMarkdownArtifact,
} from "@/services/planning/artifacts";
import { broadcastPlanningEvent } from "@/services/planning/monitor";

const app = new Hono<{ Bindings: Env }>();

app.post("/", zValidator("json", PlanningRequestInputSchema), async (c) => {
  const payload = c.req.valid("json");
  const db = getDb(c.env.DB);
  const requestId = crypto.randomUUID();

  await db.insert(projectPlanningRequests).values({
    id: requestId,
    projectId: payload.projectId,
    projectName: payload.projectName,
    workstream: payload.workstream,
    status: "queued",
    prompt: payload.prompt,
    githubRepo: payload.githubRepo,
    baseBranch: payload.baseBranch,
    stitchProjectId: payload.stitchProjectId,
    stitchScreenIdsJson: payload.stitchScreenIds ? JSON.stringify(payload.stitchScreenIds) : null,
    metadataJson: payload.metadata ? JSON.stringify(payload.metadata) : null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const instance = await c.env.PLANNING_ORCHESTRATOR.create({
    id: requestId,
    params: {
      ...payload,
      requestId,
    },
  });

  await db
    .update(projectPlanningRequests)
    .set({
      workflowInstanceId: instance.id,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(projectPlanningRequests.id, requestId));

  await broadcastPlanningEvent(c.env, requestId, {
    type: "STATUS",
    status: "queued",
    title: "Planning request created",
    message: "Workflow instance queued.",
  });

  return c.json({
    success: true,
    requestId,
    workflowInstanceId: instance.id,
    status: "queued",
    websocketUrl: `/api/planning/${requestId}/ws`,
    artifact: buildPlanningArtifactUrls(c.env, requestId),
    approveUrl: `/api/planning/${requestId}/approve`,
  });
});

app.get("/:id/ws", async (c) => {
  const requestId = c.req.param("id");
  const stubId = c.env.PLANNING_MONITOR.idFromName(requestId);
  const stub = c.env.PLANNING_MONITOR.get(stubId);
  const url = new URL(c.req.url);
  url.hostname = "internal";
  url.pathname = "/ws";
  url.searchParams.set("requestId", requestId);
  return stub.fetch(new Request(url.toString(), c.req.raw));
});

app.get("/:id/artifact", async (c) => {
  const db = getDb(c.env.DB);
  const requestId = c.req.param("id");
  const request = await db
    .select()
    .from(projectPlanningRequests)
    .where(eq(projectPlanningRequests.id, requestId))
    .get();

  if (!request) {
    return c.json({ success: false, error: "Planning request not found" }, 404);
  }

  if (!request.r2PlanKey) {
    return c.json({ success: false, error: "Artifact is not ready yet" }, 409);
  }

  const artifact = await getPlanningMarkdownArtifact(c.env, request.r2PlanKey);
  if (!artifact) {
    return c.json({ success: false, error: "Artifact missing from R2" }, 404);
  }

  const download = ["1", "true"].includes((c.req.query("download") || "").toLowerCase());
  const headers = new Headers({
    "Content-Type": "text/markdown; charset=utf-8",
  });

  if (download) {
    headers.set(
      "Content-Disposition",
      `attachment; filename="planning-${requestId}.md"`,
    );
  }

  return new Response(artifact.body, { headers });
});

app.post("/:id/approve", zValidator("json", PlanningApprovalInputSchema), async (c) => {
  const requestId = c.req.param("id");
  const payload = c.req.valid("json");
  const db = getDb(c.env.DB);
  const request = await db
    .select()
    .from(projectPlanningRequests)
    .where(eq(projectPlanningRequests.id, requestId))
    .get();

  if (!request) {
    return c.json({ success: false, error: "Planning request not found" }, 404);
  }

  const instance = await c.env.PLANNING_ORCHESTRATOR.get(request.workflowInstanceId || requestId);
  await instance.sendEvent({
    type: "planning.approve",
    payload,
  });

  return c.json({
    success: true,
    requestId,
    status: "approval_sent",
  });
});

app.get("/:id", async (c) => {
  const requestId = c.req.param("id");
  const db = getDb(c.env.DB);
  const request = await db
    .select()
    .from(projectPlanningRequests)
    .where(eq(projectPlanningRequests.id, requestId))
    .get();

  if (!request) {
    return c.json({ success: false, error: "Planning request not found" }, 404);
  }

  let workflowStatus: Awaited<ReturnType<WorkflowInstance["status"]>> | null = null;
  try {
    const instance = await c.env.PLANNING_ORCHESTRATOR.get(request.workflowInstanceId || requestId);
    workflowStatus = await instance.status();
  } catch {
    workflowStatus = null;
  }

  return c.json({
    success: true,
    request: {
      ...request,
      metadata: request.metadataJson ? JSON.parse(request.metadataJson) : null,
      stitchScreenIds: request.stitchScreenIdsJson
        ? JSON.parse(request.stitchScreenIdsJson)
        : [],
      artifact: request.r2PlanKey ? buildPlanningArtifactUrls(c.env, requestId) : null,
      websocketUrl: `/api/planning/${requestId}/ws`,
      approveUrl: `/api/planning/${requestId}/approve`,
      workflowStatus,
    },
  });
});

export default app;
