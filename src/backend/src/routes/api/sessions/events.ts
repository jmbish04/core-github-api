/**
 * @file routes/api/sessions/events.ts
 * @description Event listing and publishing endpoints for AgenticSession.
 *   GET /api/sessions/:sessionId/events?limit=&afterSeq= - list events
 *   POST /api/sessions/:sessionId/events - publish (requires publish permission)
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { SessionEvent } from '@/services/agentic-session/types';
import { getSession } from '@/services/agentic-session';

const eventsApi = new OpenAPIHono<{ Bindings: Env }>();

// GET /events - List events
const listEventsRoute = createRoute({
  method: 'get',
  path: '/:sessionId/events',
  operationId: 'listSessionEvents',
  request: {
    params: z.object({
      sessionId: z.string().uuid(),
    }),
    query: z.object({
      limit: z.coerce.number().int().positive().max(1000).optional().default(100),
      afterSeq: z.coerce.number().int().nonnegative().optional(),
    }),
  },
  responses: {
    200: {
      description: 'List of session events',
      content: {
        'application/json': {
          schema: z.object({
            events: z.array(SessionEvent),
            nextSeq: z.number().int().nonnegative().optional(),
          }),
        },
      },
    },
    404: {
      description: 'Session not found',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

eventsApi.openapi(listEventsRoute, async (c) => {
  const { sessionId } = c.req.valid('param');
  const { limit, afterSeq } = c.req.valid('query');

  const client = getSession(c.env, sessionId);

  try {
    const events = await client.listEvents(limit, afterSeq || 0);
    const nextSeq = events.length > 0 ? events[events.length - 1].sequenceNum + 1 : undefined;

    return c.json({ events, nextSeq });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to list events';
    return c.json({ error: message }, 500);
  }
});

// POST /events - Publish event
const publishEventRoute = createRoute({
  method: 'post',
  path: '/:sessionId/events',
  operationId: 'publishSessionEvent',
  request: {
    params: z.object({
      sessionId: z.string().uuid(),
    }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            type: z.string(),
            payload: z.record(z.unknown()),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Event published successfully',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            sequenceNum: z.number().int().nonnegative(),
          }),
        },
      },
    },
    400: {
      description: 'Invalid event data',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    403: {
      description: 'No publish permission',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

eventsApi.openapi(publishEventRoute, async (c) => {
  const { sessionId } = c.req.valid('param');
  const eventData = c.req.valid('json');

  const client = getSession(c.env, sessionId);

  try {
    // Publish through SessionClient which handles DO RPC
    await client.publish(eventData as any);

    // Return success (sequence number would need to be returned from DO in real implementation)
    return c.json({ success: true, sequenceNum: 0 }, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to publish event';

    if (message.includes('permission')) {
      return c.json({ error: message }, 403);
    }

    return c.json({ error: message }, 400);
  }
});

export default eventsApi;
