/**
 * @file backend/src/routes/api/sentinel/tasks.ts
 * @description Sentinel task management endpoints — reuses existing `tasks` table.
 *
 * - GET  /tasks/available  — unclaimed tasks (assignee IS NULL)
 * - POST /tasks/:id/claim  — sets assignee, logs audit event
 * - PATCH /tasks/:id       — updates task status/kanbanColumn
 * - POST /tasks/:id/submit — marks task in_review, dispatches GUARDRAIL_AGENT
 *
 * @module Routes/Sentinel
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { getDb } from "@db";
import { tasks, taskEvents } from "@/db/schemas/projects/backlog/tasks";
import { eq, isNull, desc } from "drizzle-orm";
import { getAgentByName } from "agents";
import { Logger } from "@/lib/logger";

const app = new OpenAPIHono<{ Bindings: Env }>();

// ─── GET /tasks/available ────────────────────────────────────────────────────

const availableRoute = createRoute({
  method: "get",
  path: "/tasks/available",
  operationId: "getAvailableTasks",
  tags: ["Sentinel"],
  responses: {
    200: {
      description: "Unclaimed tasks available for agent assignment",
      content: {
        "application/json": {
          schema: z.object({
            tasks: z.array(z.any()),
          }),
        },
      },
    },
  },
});

(app.openapi as any)(availableRoute, async (c: any) => {
  const logger = new Logger(c.env as any, "SentinelTasks");
  const logPrefix = `[getAvailableTasks] `;
  logger.info(`${logPrefix}Received request for available tasks`);
  const db = getDb(c.env.DB);
  const available = await db
    .select()
    .from(tasks)
    .where(isNull(tasks.assignee))
    .orderBy(desc(tasks.createdAt))
    .limit(50);
  logger.info(`${logPrefix}Returning ${available.length} available tasks`);
  return c.json({ tasks: available as any[] }, 200);
});

// ─── POST /tasks/:id/claim ──────────────────────────────────────────────────

const claimRoute = createRoute({
  method: "post",
  path: "/tasks/{id}/claim",
  operationId: "claimTask",
  tags: ["Sentinel"],
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            assignee: z.string(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Task claimed successfully",
      content: { "application/json": { schema: z.object({ ok: z.boolean() }) } },
    },
  },
});

app.openapi(claimRoute, async (c) => {
  const { id } = c.req.valid("param");
  const { assignee } = c.req.valid("json");
  const logger = new Logger(c.env as any, "SentinelTasks");
  const logPrefix = `[claimTask] `;
  logger.info(`${logPrefix}Received request to claim task ${id} for assignee ${assignee}`);
  const db = getDb(c.env.DB);

  await db.update(tasks).set({ assignee, updatedAt: new Date().toISOString() }).where(eq(tasks.id, id));
  logger.info(`${logPrefix}Updated task ${id} assignee to ${assignee}`);

  await db.insert(taskEvents).values({
    id: crypto.randomUUID(),
    taskId: id,
    eventType: "sentinel_claim",
    objectType: "task",
    fieldName: "assignee",
    newValue: assignee,
    status: "success",
    timestamp: new Date().toISOString(),
  });
  logger.info(`${logPrefix}Created task auditEvent for claim task ${id}`);

  return c.json({ ok: true });
});

// ─── PATCH /tasks/:id ───────────────────────────────────────────────────────

const updateRoute = createRoute({
  method: "patch",
  path: "/tasks/{id}",
  operationId: "updateTask",
  tags: ["Sentinel"],
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            status: z.string().optional(),
            kanbanColumn: z.string().optional(),
            assignee: z.string().optional(),
            description: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Task updated",
      content: { "application/json": { schema: z.object({ ok: z.boolean() }) } },
    },
  },
});

app.openapi(updateRoute, async (c) => {
  const { id } = c.req.valid("param");
  const updates = c.req.valid("json");
  const logger = new Logger(c.env as any, "SentinelTasks");
  const logPrefix = `[updateTask] `;
  logger.info(`${logPrefix}Received request to update task ${id}; ${JSON.stringify(updates)}`);
  const db = getDb(c.env.DB);

  await db
    .update(tasks)
    .set({ ...updates, updatedAt: new Date().toISOString() })
    .where(eq(tasks.id, id));
  logger.info(`${logPrefix}Updated task ${id} successfully`);

  return c.json({ ok: true });
});

// ─── POST /tasks/:id/submit ────────────────────────────────────────────────

const submitRoute = createRoute({
  method: "post",
  path: "/tasks/{id}/submit",
  operationId: "submitTask",
  tags: ["Sentinel"],
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            prUrl: z.string().optional(),
            notes: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Task submitted for review",
      content: { "application/json": { schema: z.object({ ok: z.boolean() }) } },
    },
  },
});

app.openapi(submitRoute, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const logger = new Logger(c.env as any, "SentinelTasks");
  const logPrefix = `[submitTask] `;
  logger.info(`${logPrefix}Received request to submit task ${id}`);
  const db = getDb(c.env.DB);

  await db
    .update(tasks)
    .set({
      status: "in_review",
      kanbanColumn: "in_review",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(tasks.id, id));
  logger.info(`${logPrefix}Updated task ${id} to in_review`);

  await db.insert(taskEvents).values({
    id: crypto.randomUUID(),
    taskId: id,
    eventType: "sentinel_submit",
    objectType: "task",
    fieldName: "status",
    oldValue: "in_progress",
    newValue: "in_review",
    details: JSON.stringify({ prUrl: body.prUrl, notes: body.notes }),
    status: "success",
    timestamp: new Date().toISOString(),
  });
  logger.info(`${logPrefix}Created task auditEvent for task ${id}`);

  // Dispatch to GUARDRAIL_AGENT for review
  try {
    logger.info(`${logPrefix}Dispatching GUARDRAIL_AGENT for task ${id}`);
    const judge = await getAgentByName(c.env.GUARDRAIL_AGENT as any, `task-${id}`);
    await (judge as any).evaluateTask(id, body.prUrl);
    logger.info(`${logPrefix}Dispatched GUARDRAIL_AGENT for task ${id}`);
  } catch (err) {
    logger.error(`${logPrefix}Failed to dispatch to GUARDRAIL_AGENT for task ${id}; ${JSON.stringify(err)}`);
  }

  return c.json({ ok: true });
});

export default app;
