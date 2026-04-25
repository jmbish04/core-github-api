/**
 * @file routes/api/agents/traceability.ts
 * @description Read-only API endpoints exposing the D1 mirrors of all
 *              Durable Object SQLite tables. Provides full traceability
 *              across agent evaluations, chat subscriptions, and rule caches.
 *
 * GET /api/agents/traceability/guardrail/evaluations  — all verdict records
 * GET /api/agents/traceability/guardrail/rules        — rule cache snapshot
 * GET /api/agents/traceability/chat/subscribers       — room → agent subscriptions
 * GET /api/agents/traceability/chat/logs              — message history (paginated)
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { getDb } from '@db';
import {
  guardrailEvaluations,
  guardrailRuleCache,
  chatRoomSubscribers,
  chatRoomLogs,
} from '@db/schemas/agents/mirror';
import { desc, eq } from 'drizzle-orm';

const traceabilityApi = new OpenAPIHono<{ Bindings: Env }>();

// ── Guardrail Evaluations ────────────────────────────────────────────────────

const GuardrailEvalSchema = z.object({
  requestId: z.string(),
  agentId: z.string(),
  status: z.string(),
  score: z.number(),
  issuesJson: z.string().nullable(),
  evaluatedAt: z.string(),
});

traceabilityApi.openapi(
  createRoute({
    method: 'get',
    path: '/guardrail/evaluations',
    operationId: 'getGuardrailEvaluations',
    tags: ['Traceability'],
    summary: 'D1 mirror of all GuardrailAgent evaluation verdicts',
    request: {
      query: z.object({
        agentId: z.string().optional(),
        status: z.string().optional(),
        limit: z.coerce.number().max(500).default(100),
      }),
    },
    responses: {
      200: {
        description: 'Guardrail evaluations',
        content: { 'application/json': { schema: z.object({ evaluations: z.array(GuardrailEvalSchema) }) } },
      },
    },
  }),
  async (c) => {
    const { agentId, status, limit } = c.req.valid('query');
    const db = getDb(c.env.DB);
    let query = db.select().from(guardrailEvaluations).orderBy(desc(guardrailEvaluations.evaluatedAt)).limit(limit);

    if (agentId) {
      query = query.where(eq(guardrailEvaluations.agentId, agentId)) as any;
    } else if (status) {
      query = query.where(eq(guardrailEvaluations.status, status)) as any;
    }

    const evaluations = await query;
    return c.json({ evaluations });
  },
);

// ── Guardrail Rule Cache ─────────────────────────────────────────────────────

const GuardrailRuleSchema = z.object({
  ruleKey: z.string(),
  agentId: z.string(),
  content: z.string(),
  cachedAt: z.number(),
  updatedAt: z.string(),
});

traceabilityApi.openapi(
  createRoute({
    method: 'get',
    path: '/guardrail/rules',
    operationId: 'getGuardrailRuleCache',
    tags: ['Traceability'],
    summary: 'D1 snapshot of GuardrailAgent golden-path rule cache',
    responses: {
      200: {
        description: 'Cached guardrail rules',
        content: { 'application/json': { schema: z.object({ rules: z.array(GuardrailRuleSchema) }) } },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env.DB);
    const rules = await db
      .select()
      .from(guardrailRuleCache)
      .orderBy(desc(guardrailRuleCache.cachedAt))
      .limit(200);
    return c.json({
      rules: rules.map((r) => {
        const { cachedAt, ...rest } = r;
        return {
          ...rest,
          cachedAt: cachedAt instanceof Date ? cachedAt.getTime() : (cachedAt as unknown as number),
        };
      }),
    });
  },
);

// ── Chat Room Subscribers ────────────────────────────────────────────────────

const SubscriberSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  agentName: z.string(),
  subscribedAt: z.number(),
  updatedAt: z.string(),
});

traceabilityApi.openapi(
  createRoute({
    method: 'get',
    path: '/chat/subscribers',
    operationId: 'getChatRoomSubscribers',
    tags: ['Traceability'],
    summary: 'D1 mirror: which agents are subscribed to which chat rooms',
    request: {
      query: z.object({ roomId: z.string().optional() }),
    },
    responses: {
      200: {
        description: 'Chat room subscribers',
        content: { 'application/json': { schema: z.object({ subscribers: z.array(SubscriberSchema) }) } },
      },
    },
  }),
  async (c) => {
    const { roomId } = c.req.valid('query');
    const db = getDb(c.env.DB);
    let query = db.select().from(chatRoomSubscribers).orderBy(desc(chatRoomSubscribers.subscribedAt));
    if (roomId) {
      query = query.where(eq(chatRoomSubscribers.roomId, roomId)) as any;
    }
    const subscribers = await query;
    return c.json({
      subscribers: subscribers.map((s) => {
        const { subscribedAt, ...rest } = s;
        return {
          ...rest,
          subscribedAt: subscribedAt instanceof Date ? subscribedAt.getTime() : (subscribedAt as unknown as number),
        };
      }),
    });
  },
);

// ── Chat Room Logs ───────────────────────────────────────────────────────────

const ChatLogSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  userId: z.string().nullable(),
  userName: z.string().nullable(),
  messageType: z.string(),
  content: z.string().nullable(),
  metadataJson: z.string().nullable(),
  timestamp: z.string(),
});

traceabilityApi.openapi(
  createRoute({
    method: 'get',
    path: '/chat/logs',
    operationId: 'getChatRoomLogs',
    tags: ['Traceability'],
    summary: 'Paginated D1 mirror of ChatRoom message logs',
    request: {
      query: z.object({
        roomId: z.string().optional(),
        limit: z.coerce.number().max(500).default(100),
      }),
    },
    responses: {
      200: {
        description: 'Chat room logs',
        content: { 'application/json': { schema: z.object({ logs: z.array(ChatLogSchema) }) } },
      },
    },
  }),
  async (c) => {
    const { roomId, limit } = c.req.valid('query');
    const db = getDb(c.env.DB);
    let query = db.select().from(chatRoomLogs).orderBy(desc(chatRoomLogs.timestamp)).limit(limit);
    if (roomId) {
      query = query.where(eq(chatRoomLogs.roomId, roomId)) as any;
    }
    const logs = await query;
    return c.json({ logs });
  },
);

export default traceabilityApi;
