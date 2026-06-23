import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  PlanningDecisionActionSchema,
  PlanningListQuerySchema,
  PlanningRequestInputSchema,
  PlanningSemanticQuerySchema,
} from "@/lib/schemas/jules";
import {
  buildPlanningArtifactUrls,
  getPlanningMarkdownArtifact,
  queryPlanningArtifacts,
} from "@/services/planning/artifacts";
import { broadcastPlanningEvent } from "@/services/planning/monitor";
import {
  createPlanningRequest,
  createPlanningEvent,
  getPlanningArtifact,
  getPlanningRequest,
  listPlanningArtifacts,
  listPlanningEvents,
  listPlanningRequests,
  updatePlanningRequest,
} from "@/services/planning/store";
import { JulesService } from "@/services/jules/service";
import { getAgentByName } from 'agents';
import { BroadcastClient } from '@utils/do-broadcast';

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ success: false, error: "Missing or invalid Authorization header" }, 401);
  }
  const token = authHeader.split(" ")[1];
  const expectedKey = (await c.env.AGENTIC_WORKER_API_KEY.get() || await c.env.WORKER_API_KEY.get()) as unknown as string;
  if (!expectedKey || token !== expectedKey) {
    return c.json({ success: false, error: "Unauthorized" }, 403);
  }
  await next();
});

function renderMarkdownHtml(title: string, markdown: string): string {
  const escaped = markdown
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: ui-sans-serif, system-ui, sans-serif;
      }
      body {
        margin: 0;
        background: #0b1020;
        color: #e5e7eb;
      }
      main {
        max-width: 980px;
        margin: 0 auto;
        padding: 32px 20px 64px;
      }
      pre {
        white-space: pre-wrap;
        word-break: break-word;
        background: #111827;
        border: 1px solid #1f2937;
        border-radius: 12px;
        padding: 20px;
        overflow: auto;
      }
      a { color: #60a5fa; }
    </style>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p><a href="./plan.md">Raw markdown</a> · <a href="./download">Download</a></p>
      <pre>${escaped}</pre>
    </main>
  </body>
</html>`;
}

async function loadRequestOr404(c: Context<{ Bindings: Env }>) {
  const requestId = c.req.param("id") as string;
  const request = await getPlanningRequest(c.env, requestId);
  if (!request) {
    return { requestId, request: null, response: c.json({ success: false, error: "Planning request not found" }, 404) };
  }

  return { requestId, request, response: null };
}

app.post("/", zValidator("json", PlanningRequestInputSchema), async (c) => {
  const payload = c.req.valid("json");
  const requestId = crypto.randomUUID();
  const request = await createPlanningRequest(c.env, {
    ...payload,
    requestId,
    createdBy: c.req.header("x-user-id") || "api",
  });

  const instance = await c.env.PLANNING_ORCHESTRATOR.create({
    id: requestId,
    params: {
      ...payload,
      requestId,
    },
  });

  await updatePlanningRequest(c.env, requestId, {
    workflowInstanceId: instance.id,
  });

  await broadcastPlanningEvent(c.env, requestId, {
    source: "api",
    type: "STATUS",
    status: "queued",
    title: "Planning request created",
    message: "Workflow instance queued.",
  });

  return c.json({
    success: true,
    requestId,
    request,
    workflowInstanceId: instance.id,
    websocketUrl: `/api/planning/${requestId}/ws`,
    approveUrl: `/api/planning/${requestId}/approve`,
    reviseUrl: `/api/planning/${requestId}/revise`,
    rejectUrl: `/api/planning/${requestId}/reject`,
    planUrl: `/api/planning/${requestId}/plan`,
    planMarkdownUrl: `/api/planning/${requestId}/plan.md`,
    downloadUrl: `/api/planning/${requestId}/download`,
  });
});

app.get("/", zValidator("query", PlanningListQuerySchema), async (c) => {
  const query = c.req.valid("query");
  const requests = await listPlanningRequests(c.env, query);
  return c.json({ success: true, requests });
});

app.post("/query/semantic", zValidator("json", PlanningSemanticQuerySchema), async (c) => {
  const payload = c.req.valid("json");
  const matches = await queryPlanningArtifacts(c.env, payload);
  return c.json({ success: true, matches });
});

app.get("/:id/ws", async (c) => {
  const requestId = c.req.param("id") as string;
  return BroadcastClient.upgradeWebSocket(c.env.PLANNING_MONITOR, requestId, c.req.raw, "/ws");
});

app.get("/:id/events", async (c) => {
  const loaded = await loadRequestOr404(c);
  if (loaded.response) {
    return loaded.response;
  }

  const events = await listPlanningEvents(c.env, loaded.requestId);
  return c.json({ success: true, events });
});

app.get("/:id/artifacts", async (c) => {
  const loaded = await loadRequestOr404(c);
  if (loaded.response) {
    return loaded.response;
  }

  const artifacts = await listPlanningArtifacts(c.env, loaded.requestId);
  return c.json({ success: true, artifacts });
});

app.get("/:id/artifacts/:artifactId", async (c) => {
  const requestId = c.req.param("id") as string;
  const artifactId = c.req.param("artifactId") as string;
  const artifact = await getPlanningArtifact(c.env, requestId, artifactId);

  if (!artifact) {
    return c.json({ success: false, error: "Planning artifact not found" }, 404);
  }

  if (artifact.storageDriver !== "r2" || !artifact.storageKey) {
    return c.json({ success: true, artifact });
  }

  const object = await c.env.PLAN_ARTIFACTS.get(artifact.storageKey);
  if (!object) {
    return c.json({ success: false, error: "Planning artifact missing from R2" }, 404);
  }

  const raw = ["1", "true"].includes((c.req.query("raw") || "").toLowerCase());
  const download = ["1", "true"].includes((c.req.query("download") || "").toLowerCase());
  const content = await object.text();

  if (!raw && !download && artifact.mimeType?.startsWith("text/markdown")) {
    return c.html(renderMarkdownHtml(`Planning Artifact ${artifactId}`, content));
  }

  const headers = new Headers({
    "Content-Type": artifact.mimeType || "application/octet-stream",
  });

  if (download) {
    headers.set(
      "Content-Disposition",
      `attachment; filename="${artifact.storageKey.split("/").pop() || "artifact.txt"}"`,
    );
  }

  return new Response(content, { headers });
});

app.get("/:id/plan", async (c) => {
  const loaded = await loadRequestOr404(c);
  if (loaded.response) {
    return loaded.response;
  }

  if (!loaded.request?.r2PlanKey) {
    return c.json({ success: false, error: "Artifact is not ready yet" }, 409);
  }

  const artifact = await getPlanningMarkdownArtifact(c.env, loaded.request.r2PlanKey);
  if (!artifact) {
    return c.json({ success: false, error: "Artifact missing from R2" }, 404);
  }

  const markdown = await artifact.text();
  return c.html(renderMarkdownHtml(`Planning Request ${loaded.requestId}`, markdown));
});

app.get("/:id/plan.md", async (c) => {
  const loaded = await loadRequestOr404(c);
  if (loaded.response) {
    return loaded.response;
  }

  if (!loaded.request?.r2PlanKey) {
    return c.json({ success: false, error: "Artifact is not ready yet" }, 409);
  }

  const artifact = await getPlanningMarkdownArtifact(c.env, loaded.request.r2PlanKey);
  if (!artifact) {
    return c.json({ success: false, error: "Artifact missing from R2" }, 404);
  }

  return new Response(artifact.body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
});

app.get("/:id/download", async (c) => {
  const loaded = await loadRequestOr404(c);
  if (loaded.response) {
    return loaded.response;
  }

  if (!loaded.request?.r2PlanKey) {
    return c.json({ success: false, error: "Artifact is not ready yet" }, 409);
  }

  const artifact = await getPlanningMarkdownArtifact(c.env, loaded.request.r2PlanKey);
  if (!artifact) {
    return c.json({ success: false, error: "Artifact missing from R2" }, 404);
  }

  return new Response(artifact.body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="planning-${loaded.requestId}.md"`,
    },
  });
});

app.post("/:id/approve", zValidator("json", PlanningDecisionActionSchema), async (c) => {
  const loaded = await loadRequestOr404(c);
  if (loaded.response) {
    return loaded.response;
  }

  const payload = { ...c.req.valid("json"), decision: "approve" as const };
  const instance = await c.env.PLANNING_ORCHESTRATOR.get(
    loaded.request?.workflowInstanceId || loaded.requestId,
  );

  await instance.sendEvent({
    type: "planning.decision",
    payload,
  });

  return c.json({ success: true, requestId: loaded.requestId, decision: payload.decision });
});

app.post("/:id/revise", zValidator("json", PlanningDecisionActionSchema), async (c) => {
  const loaded = await loadRequestOr404(c);
  if (loaded.response) {
    return loaded.response;
  }

  const payload = { ...c.req.valid("json"), decision: "revise" as const };
  const instance = await c.env.PLANNING_ORCHESTRATOR.get(
    loaded.request?.workflowInstanceId || loaded.requestId,
  );

  await instance.sendEvent({
    type: "planning.decision",
    payload,
  });

  return c.json({ success: true, requestId: loaded.requestId, decision: payload.decision });
});

app.post("/:id/reject", zValidator("json", PlanningDecisionActionSchema), async (c) => {
  const loaded = await loadRequestOr404(c);
  if (loaded.response) {
    return loaded.response;
  }

  const payload = { ...c.req.valid("json"), decision: "reject" as const };
  const instance = await c.env.PLANNING_ORCHESTRATOR.get(
    loaded.request?.workflowInstanceId || loaded.requestId,
  );

  await instance.sendEvent({
    type: "planning.decision",
    payload,
  });

  return c.json({ success: true, requestId: loaded.requestId, decision: payload.decision });
});

app.post("/:id/orchestrate", async (c) => {
  const loaded = await loadRequestOr404(c);
  if (loaded.response) {
    return loaded.response;
  }

  if (!loaded.request?.r2PlanKey) {
    return c.json({ success: false, error: "Plan artifact is not ready yet" }, 409);
  }

  const artifact = await getPlanningMarkdownArtifact(c.env, loaded.request.r2PlanKey);
  if (!artifact) {
    return c.json({ success: false, error: "Artifact missing from R2" }, 404);
  }

  const markdown = await artifact.text();
  const agent = await getAgentByName(c.env.ORCHESTRATOR_AGENT as any, `planning-orchestrator-${loaded.requestId}`);
  let response;
  try {
    // Direct DO RPC — call @callable orchestrate()
    response = await (agent as any).orchestrate({
      requestId: loaded.requestId,
      workstream: loaded.request?.workstream,
      markdown,
      projectId: loaded.request?.projectId || undefined,
      projectName: loaded.request?.projectName || undefined,
    });
  } catch (error: any) {
    return c.json(
      { success: false, error: `Planning orchestration failed: ${error.message}` },
      500
    );
  }

  if (!response.success) {
    return c.json(
      { success: false, error: `Planning orchestration failed: ${response.error || "Unknown error"}` },
      500,
    );
  }

  await createPlanningEvent(c.env, {
    requestId: loaded.requestId,
    source: "api",
    eventType: "manual.orchestrate",
    title: "Manual orchestration requested",
    message: "Plan was manually orchestrated into project tasks.",
  });

  return c.json({
    success: true,
    requestId: loaded.requestId,
    result: await response.json(),
  });
});

app.post("/:id/implement", async (c) => {
  const loaded = await loadRequestOr404(c);
  if (loaded.response) {
    return loaded.response;
  }

  const request = loaded.request!;
  if (!request.githubRepo) {
    return c.json({ success: false, error: "Implementation requires a GitHub repository context" }, 409);
  }

  if (!request.r2PlanKey) {
    return c.json({ success: false, error: "Plan artifact is not ready yet" }, 409);
  }

  const artifact = await getPlanningMarkdownArtifact(c.env, request.r2PlanKey);
  if (!artifact) {
    return c.json({ success: false, error: "Plan artifact missing from R2" }, 404);
  }

  const markdown = await artifact.text();
  const [owner, repo] = request.githubRepo.split("/");
  const jules = JulesService.getInstance(c.env);
  const session = await jules.startSession({
    prompt: [
      "Implement the following approved plan end-to-end.",
      "Run build, test, and verification commands before concluding.",
      "",
      markdown,
    ].join("\n"),
    repo: {
      owner,
      repo,
      branch: request.baseBranch || "main",
    },
    autoPr: true,
    requireApproval: false,
    projectId: request.projectId || undefined,
    planningRequestId: loaded.requestId,
    sessionRole: "implementation",
  });

  await updatePlanningRequest(c.env, loaded.requestId, {
    status: "implementing",
    julesSessionId: session.id,
  });

  await broadcastPlanningEvent(c.env, loaded.requestId, {
    source: "api",
    type: "STATUS",
    status: "implementing",
    title: "Implementation session started",
    message: `Jules implementation session ${session.id} created.`,
  });

  return c.json({
    success: true,
    requestId: loaded.requestId,
    sessionId: session.id,
    status: "implementing",
  });
});

app.get("/:id", async (c) => {
  const loaded = await loadRequestOr404(c);
  if (loaded.response) {
    return loaded.response;
  }

  let workflowStatus: Awaited<ReturnType<WorkflowInstance["status"]>> | null = null;
  try {
    const instance = await c.env.PLANNING_ORCHESTRATOR.get(
      loaded.request?.workflowInstanceId || loaded.requestId,
    );
    workflowStatus = await instance.status();
  } catch {
    workflowStatus = null;
  }

  const markdown =
    loaded.request?.r2PlanKey
      ? await getPlanningMarkdownArtifact(c.env, loaded.request.r2PlanKey).then((artifact) =>
          artifact ? artifact.text() : null,
        )
      : null;

  return c.json({
    success: true,
    request: {
      ...loaded.request,
      artifact: buildPlanningArtifactUrls(c.env, loaded.requestId),
      websocketUrl: `/api/planning/${loaded.requestId}/ws`,
      approveUrl: `/api/planning/${loaded.requestId}/approve`,
      reviseUrl: `/api/planning/${loaded.requestId}/revise`,
      rejectUrl: `/api/planning/${loaded.requestId}/reject`,
      orchestrateUrl: `/api/planning/${loaded.requestId}/orchestrate`,
      implementUrl: `/api/planning/${loaded.requestId}/implement`,
      workflowStatus,
      markdown,
    },
  });
});

export default app;
