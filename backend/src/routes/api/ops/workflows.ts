import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "@db";
import { automationRules } from "@/db/schemas/app/automation_rules";
import { eq } from "drizzle-orm";
import { generateUuid } from "@/utils/common";
import { DEFAULT_GITHUB_OWNER, DEFAULT_TEMPLATE_REPO } from "@github-utils";
import { getWebhooksDb } from "@db";
import { webhookConfigs, automationLogs } from "@/db/schemas/webhooks/automations";
import { desc } from "drizzle-orm";
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
  targetRepo: z.string().default(`${DEFAULT_GITHUB_OWNER}/${DEFAULT_TEMPLATE_REPO}`),
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

  const julesApiUrl = (c.env as unknown as Record<string, unknown>).JULES_API_URL as string | undefined;
  const julesApiToken = (c.env as unknown as Record<string, unknown>).JULES_API_TOKEN as string | undefined;

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

// ==========================================
// Automation Rules CRUD
// ==========================================

// Removed redeclared imports

const AutomationRuleBody = z.object({
  name: z.string(),
  description: z.string(),
  triggerEvent: z.string(),
  triggerAction: z.string().optional().nullable(),
  triggerBranch: z.string().optional().nullable(),
  workflow: z.string(),
  isActive: z.boolean().default(true)
});

workflowsApi.get("/rules", async (c) => {
  const db = getDb(c.env.DB);
  const rules = await db.select().from(automationRules).all();
  return c.json({ success: true, rules });
});

workflowsApi.post("/rules", zValidator("json", AutomationRuleBody), async (c) => {
  const db = getDb(c.env.DB);
  const body = c.req.valid("json");
  const now = new Date().toISOString();
  const rule = {
    id: generateUuid(),
    name: body.name,
    description: body.description,
    triggerEvent: body.triggerEvent,
    triggerAction: body.triggerAction || null,
    triggerBranch: body.triggerBranch || null,
    workflow: body.workflow,
    isActive: body.isActive,
    createdAt: now,
    updatedAt: now
  };
  
  await db.insert(automationRules).values(rule);
  return c.json({ success: true, rule });
});

workflowsApi.put("/rules/:id", zValidator("json", AutomationRuleBody.partial()), async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  const body = c.req.valid("json");
  
  const setClause: Partial<typeof automationRules.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (body.name !== undefined) setClause.name = body.name;
  if (body.description !== undefined) setClause.description = body.description;
  if (body.triggerEvent !== undefined) setClause.triggerEvent = body.triggerEvent;
  if (body.triggerAction !== undefined) setClause.triggerAction = body.triggerAction || null;
  if (body.triggerBranch !== undefined) setClause.triggerBranch = body.triggerBranch || null;
  if (body.workflow !== undefined) setClause.workflow = body.workflow;
  if (body.isActive !== undefined) setClause.isActive = body.isActive;

  await db.update(automationRules).set(setClause).where(eq(automationRules.id, id));
  const updated = await db.select().from(automationRules).where(eq(automationRules.id, id)).get();
  return c.json({ success: true, rule: updated });
});

workflowsApi.delete("/rules/:id", async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  await db.delete(automationRules).where(eq(automationRules.id, id));
  return c.json({ success: true });
});

// ==========================================
// Webhook Configs (Global Automations)
// ==========================================

// Removed redeclared imports

const WebhookConfigBody = z.object({
  automationClass: z.string(),
  isActive: z.boolean(),
  usePat: z.boolean(),
});

workflowsApi.get("/configs", async (c) => {
  const db = getWebhooksDb(c.env.DB_WEBHOOKS);
  const configs = await db.select().from(webhookConfigs).all();
  return c.json({ success: true, configs });
});

workflowsApi.post("/configs", zValidator("json", WebhookConfigBody), async (c) => {
  const db = getWebhooksDb(c.env.DB_WEBHOOKS);
  const body = c.req.valid("json");
  
  const existing = await db.select().from(webhookConfigs).where(eq(webhookConfigs.automationClass, body.automationClass)).get();
  
  if (existing) {
    await db.update(webhookConfigs).set({
      isActive: body.isActive,
      usePat: body.usePat,
      updatedAt: new Date().toISOString()
    }).where(eq(webhookConfigs.id, existing.id));
  } else {
    await db.insert(webhookConfigs).values({
      id: generateUuid(),
      automationClass: body.automationClass,
      isActive: body.isActive,
      usePat: body.usePat,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
  
  return c.json({ success: true });
});

// ==========================================
// Automation Logs
// ==========================================

workflowsApi.get("/logs", async (c) => {
  const db = getWebhooksDb(c.env.DB_WEBHOOKS);
  const logs = await db.select()
    .from(automationLogs)
    .orderBy(desc(automationLogs.createdAt))
    .limit(100)
    .all();
  return c.json({ success: true, logs });
});

export default workflowsApi;

