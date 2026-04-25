/**
 * @file routes/api/frontend/hitl.ts
 * @description HITL (Human-In-The-Loop) API routes for approval workflows.
 *
 * Routes:
 *   GET  /summary              → Pending items grouped by category with counts
 *   GET  /category/:category   → All items for a specific category
 *   GET  /:id                  → Single HITL item lookup
 *   POST /                     → Create a new HITL proposal
 *   POST /:id/approve          → Approve via LearningAgent RPC
 *   POST /:id/reject           → Reject via LearningAgent RPC
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { getDb } from '@db';
import { hitlQueue } from '@db/schemas/workflows/hitl';
import { eq, desc, sql } from 'drizzle-orm';
import { getAgentByName } from 'agents';

const hitlApi = new OpenAPIHono<{ Bindings: Env }>();

// ── Schemas ─────────────────────────────────────────────────────────────

const HitlItemSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  category: z.string(),
  entityId: z.string().nullable(),
  proposedPayload: z.any(),
  contextMetadata: z.any(),
  status: z.enum(['pending', 'approved', 'rejected', 'expired']),
  humanFeedback: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).openapi('HitlItem');

const CategorySummarySchema = z.object({
  category: z.string(),
  count: z.number(),
}).openapi('CategorySummary');

// ── GET /summary ────────────────────────────────────────────────────────

const summaryRoute = createRoute({
  method: 'get',
  path: '/summary',
  tags: ['HITL'],
  summary: 'Pending HITL items grouped by category',
  responses: {
    200: {
      description: 'Category summary with counts',
      content: {
        'application/json': {
          schema: z.object({ summary: z.array(CategorySummarySchema) }),
        },
      },
    },
  },
});

hitlApi.openapi(summaryRoute, async (c) => {
  const db = getDb(c.env.DB);
  const summary = await db
    .select({
      category: hitlQueue.category,
      count: sql<number>`count(*)`,
    })
    .from(hitlQueue)
    .where(eq(hitlQueue.status, 'pending'))
    .groupBy(hitlQueue.category)
    .all();

  return c.json({ summary });
});

// ── GET /category/:category ─────────────────────────────────────────────

const categoryRoute = createRoute({
  method: 'get',
  path: '/category/{category}',
  tags: ['HITL'],
  summary: 'All HITL items for a category',
  request: {
    params: z.object({ category: z.string() }),
  },
  responses: {
    200: {
      description: 'Items for the requested category',
      content: {
        'application/json': {
          schema: z.object({ items: z.array(HitlItemSchema) }),
        },
      },
    },
  },
});

hitlApi.openapi(categoryRoute, async (c) => {
  const categoryName = c.req.valid('param').category;
  const db = getDb(c.env.DB);

  const items = await db
    .select()
    .from(hitlQueue)
    .where(eq(hitlQueue.category, categoryName))
    .orderBy(desc(hitlQueue.createdAt))
    .all();

  return c.json({ items });
});

// ── GET /:id ─────────────────────────────────────────────────────────────

// ── GET /:id ─────────────────────────────────────────────────────────────
// Plain Hono handler — OpenAPI multi-status union types cause inference issues

hitlApi.get('/:id', async (c) => {
  const itemId = c.req.param('id');
  const db = getDb(c.env.DB);

  const item = await db
    .select()
    .from(hitlQueue)
    .where(eq(hitlQueue.id, itemId))
    .get();

  if (!item) {
    return c.json({ error: 'HITL item not found' }, 404);
  }

  return c.json({ item });
});

// ── POST / ──────────────────────────────────────────────────────────────

const CreateProposalSchema = z.object({
  category: z.string().min(1),
  entityId: z.string().optional(),
  proposedPayload: z.any(),
  contextMetadata: z.any().optional().default({}),
}).openapi('CreateHitlProposal');

const createRoute2 = createRoute({
  method: 'post',
  path: '/',
  tags: ['HITL'],
  summary: 'Create a new HITL proposal',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateProposalSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'HITL proposal created',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.boolean(),
            id: z.string(),
            workflowId: z.string().nullable(),
          }),
        },
      },
    },
  },
});

hitlApi.openapi(createRoute2, async (c) => {
  const body = c.req.valid('json');
  const db = getDb(c.env.DB);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(hitlQueue).values({
    id,
    workflowId: '', // populated by workflow if kicked off
    category: body.category,
    entityId: body.entityId ?? null,
    proposedPayload: body.proposedPayload,
    contextMetadata: body.contextMetadata ?? {},
    status: 'pending',
    humanFeedback: null,
    createdAt: now,
    updatedAt: now,
  });

  // Kick off HitlWorkflow if binding is available
  let workflowId: string | null = null;
  try {
    if ((c.env as any).HITL_WORKFLOW) {
      const instance = await (c.env as any).HITL_WORKFLOW.create({
        params: { hitlRecordId: id, category: body.category },
      });
      workflowId = instance.id;
      // Update the record with the workflow ID
      await db
        .update(hitlQueue)
        .set({ workflowId: workflowId ?? '', updatedAt: new Date().toISOString() })
        .where(eq(hitlQueue.id, id));
    }
  } catch {
    // Workflow binding may not exist — item still created for manual review
  }

  return c.json({ ok: true, id, workflowId }, 201);
});

// ── POST /:id/approve ───────────────────────────────────────────────────

const ApproveSchema = z.object({ feedback: z.string().optional() });

const approveRoute = createRoute({
  method: 'post',
  path: '/{id}/approve',
  tags: ['HITL'],
  summary: 'Approve a HITL item via LearningAgent',
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        'application/json': {
          schema: ApproveSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Approval result',
      content: {
        'application/json': {
          schema: z.object({ ok: z.boolean() }).passthrough(),
        },
      },
    },
    500: {
      description: 'Agent error',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
});

hitlApi.openapi(approveRoute, async (c) => {
  const hitlRecordId = c.req.valid('param').id;
  const { feedback } = c.req.valid('json');

  const stub = await getAgentByName(c.env.LEARNING_AGENT as any, 'learning_agent') as any;
  if (!stub) {
    return c.json({ error: 'Learning agent not found' }, 500);
  }

  try {
    const result = await stub.approveAction(hitlRecordId, feedback);
    return c.json(result);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── POST /:id/reject ────────────────────────────────────────────────────

const RejectSchema = z.object({ reason: z.string().optional() });

const rejectRoute = createRoute({
  method: 'post',
  path: '/{id}/reject',
  tags: ['HITL'],
  summary: 'Reject a HITL item via LearningAgent',
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        'application/json': {
          schema: RejectSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Rejection result',
      content: {
        'application/json': {
          schema: z.object({ ok: z.boolean() }).passthrough(),
        },
      },
    },
    500: {
      description: 'Agent error',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
});

hitlApi.openapi(rejectRoute, async (c) => {
  const hitlRecordId = c.req.valid('param').id;
  const { reason } = c.req.valid('json');

  const stub = await getAgentByName(c.env.LEARNING_AGENT as any, 'learning_agent') as any;
  if (!stub) {
    return c.json({ error: 'Learning agent not found' }, 500);
  }

  try {
    const result = await stub.rejectAction(hitlRecordId, reason);
    return c.json(result);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

export { hitlApi };
