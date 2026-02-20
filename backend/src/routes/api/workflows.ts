import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { Bindings } from "../../utils/hono";

const TranscriptMessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(["assistant", "user"]),
  content: z.string().min(1),
});

const WorkflowCanvasSchema = z.object({
  nodes: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        subtitle: z.string().optional(),
        position: z.object({
          x: z.number(),
          y: z.number(),
        }),
      }),
    )
    .default([]),
  edges: z
    .array(
      z.object({
        id: z.string(),
        source: z.string(),
        target: z.string(),
      }),
    )
    .default([]),
});

const JulesTaskSchema = z.object({
  targetRepo: z.string().default("jmbish04/core-github-api"),
  workflowKey: z.string(),
  workflowTitle: z.string(),
  mode: z.enum(["new", "edit"]),
  optimizedPrompt: z.string().min(1),
  transcript: z.array(TranscriptMessageSchema).min(1),
  canvas: WorkflowCanvasSchema.optional(),
});

const workflowsApi = new Hono<{ Bindings: Env }>();

workflowsApi.post("/jules", zValidator("json", JulesTaskSchema), async (c) => {
  const payload = c.req.valid("json");
  const createdAt = new Date().toISOString();

  const compiledPrompt = [
    `Target repository: ${payload.targetRepo}`,
    `Workflow key: ${payload.workflowKey}`,
    `Workflow title: ${payload.workflowTitle}`,
    `Workflow mode: ${payload.mode}`,
    "",
    payload.optimizedPrompt,
    "",
    `Canvas summary: ${payload.canvas?.nodes.length || 0} nodes, ${payload.canvas?.edges.length || 0} edges`,
  ].join("\n");

  const taskEnvelope = {
    source: "core-github-api",
    createdAt,
    targetRepo: payload.targetRepo,
    workflowKey: payload.workflowKey,
    workflowTitle: payload.workflowTitle,
    mode: payload.mode,
    prompt: compiledPrompt,
    transcript: payload.transcript,
    canvas: payload.canvas || { nodes: [], edges: [] },
  };

  const julesApiUrl = (c.env as any).JULES_API_URL as string | undefined;
  const julesApiToken = (c.env as any).JULES_API_TOKEN as string | undefined;

  if (!julesApiUrl) {
    return c.json({
      success: true,
      dispatched: false,
      message:
        "Jules endpoint is not configured. Task envelope compiled and ready to dispatch.",
      task: taskEnvelope,
    });
  }

  const response = await fetch(julesApiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(julesApiToken
        ? {
            authorization: `Bearer ${julesApiToken}`,
          }
        : {}),
    },
    body: JSON.stringify(taskEnvelope),
  });

  if (!response.ok) {
    const details = await response.text();
    return c.json(
      {
        success: false,
        dispatched: false,
        error: `Jules API rejected task (${response.status}): ${details}`,
      },
      502,
    );
  }

  const result = await response.json().catch(() => ({}));
  return c.json({
    success: true,
    dispatched: true,
    message: "Workflow task dispatched to Jules successfully.",
    task: taskEnvelope,
    result,
  });
});

export default workflowsApi;

