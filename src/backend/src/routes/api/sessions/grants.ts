/**
 * @file routes/api/sessions/grants.ts
 * @description Grant and revoke permissions for AgenticSession.
 *   POST /api/sessions/:sessionId/grants - issue grant
 *   DELETE /api/sessions/:sessionId/grants/:subject/:permission - revoke
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { Permission } from '@/services/agentic-session/types';
import { getSession } from '@/services/agentic-session';

const grantsApi = new OpenAPIHono<{ Bindings: Env }>();

// POST /grants - Issue grant
const issueGrantRoute = createRoute({
  method: 'post',
  path: '/:sessionId/grants',
  operationId: 'issueSessionGrant',
  request: {
    params: z.object({
      sessionId: z.string().uuid(),
    }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            subject: z.string(),
            permissions: z.array(Permission),
            expiresIn: z.number().int().positive().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Grant issued successfully',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
          }),
        },
      },
    },
    400: {
      description: 'Invalid grant data',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    403: {
      description: 'No admin permission',
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

grantsApi.openapi(issueGrantRoute, async (c) => {
  const { sessionId } = c.req.valid('param');
  const { subject, permissions, expiresIn } = c.req.valid('json');

  const client = getSession(c.env, sessionId);

  try {
    await client.grant(subject, permissions, expiresIn);
    return c.json({ success: true }, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to issue grant';

    if (message.includes('permission') || message.includes('admin')) {
      return c.json({ error: message }, 403);
    }

    return c.json({ error: message }, 400);
  }
});

// DELETE /grants/:subject/:permission - Revoke grant
const revokeGrantRoute = createRoute({
  method: 'delete',
  path: '/:sessionId/grants/:subject/:permission',
  operationId: 'revokeSessionGrant',
  request: {
    params: z.object({
      sessionId: z.string().uuid(),
      subject: z.string(),
      permission: Permission,
    }),
  },
  responses: {
    200: {
      description: 'Grant revoked successfully',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
          }),
        },
      },
    },
    403: {
      description: 'No admin permission',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    404: {
      description: 'Grant not found',
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

grantsApi.openapi(revokeGrantRoute, async (c) => {
  const { sessionId, subject, permission } = c.req.valid('param');

  const doId = (c.env.AGENTIC_SESSION_DO as any).idFromString(sessionId);
  const doStub = (c.env.AGENTIC_SESSION_DO as any).get(doId);

  try {
    const response = await doStub.fetch('http://internal/revoke', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, permission }),
    });

    if (!response.ok) {
      const errorText = await response.text();

      if (response.status === 403) {
        return c.json({ error: errorText }, 403);
      }

      if (response.status === 404) {
        return c.json({ error: errorText }, 404);
      }

      return c.json({ error: errorText }, 500);
    }

    return c.json({ success: true }, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to revoke grant';
    return c.json({ error: message }, 500);
  }
});

export default grantsApi;
