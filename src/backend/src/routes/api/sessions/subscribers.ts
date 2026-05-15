/**
 * @file routes/api/sessions/subscribers.ts
 * @description List active subscribers for an AgenticSession.
 *   GET /api/sessions/:sessionId/subscribers
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { getSession } from '@/services/agentic-session';

const subscribersApi = new OpenAPIHono<{ Bindings: Env }>();

const route = createRoute({
  method: 'get',
  path: '/:sessionId/subscribers',
  operationId: 'listSessionSubscribers',
  request: {
    params: z.object({
      sessionId: z.string().uuid(),
    }),
  },
  responses: {
    200: {
      description: 'List of active subscribers',
      content: {
        'application/json': {
          schema: z.object({
            subscribers: z.array(
              z.object({
                subscriberId: z.string(),
                subscriberType: z.string(),
                connectedAt: z.number().int().positive(),
              })
            ),
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
    500: {
      description: 'Internal server error',
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

subscribersApi.openapi(route, async (c) => {
  const { sessionId } = c.req.valid('param');

  const client = getSession(c.env, sessionId);

  try {
    const subscribers = await client.listSubscribers();
    return c.json({ subscribers }, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to list subscribers';
    return c.json({ error: message }, 500);
  }
});

export default subscribersApi;
