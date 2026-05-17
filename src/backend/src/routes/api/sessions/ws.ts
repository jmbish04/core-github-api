/**
 * @file routes/api/sessions/ws.ts
 * @description WebSocket upgrade endpoint for AgenticSession.
 *   JWT-validates the ?token= query param, then forwards the Upgrade request to the DO.
 *   Rejects 401/403 at the Hono layer before waking the DO if token is invalid.
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { verifySessionToken } from '@/services/agentic-session/auth';

const wsApi = new OpenAPIHono<{ Bindings: Env }>();

const route = createRoute({
  method: 'get',
  path: '/:sessionId/ws',
  operationId: 'connectSessionWebSocket',
  request: {
    params: z.object({
      sessionId: z.string().uuid(),
    }),
    query: z.object({
      token: z.string(),
    }),
  },
  responses: {
    101: {
      description: 'WebSocket connection upgraded',
    },
    401: {
      description: 'Token missing or invalid',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    403: {
      description: 'No read permission for this session',
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

wsApi.openapi(route, async (c) => {
  const { sessionId } = c.req.valid('param');
  const { token } = c.req.valid('query');

  // Verify JWT before waking the DO
  const secret = c.env.SESSION_TOKEN_SECRET as unknown as string;
  let claims;
  try {
    claims = await verifySessionToken(secret, token);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid token';
    return c.json({ error: message }, 401);
  }

  // Verify token is for this session
  if (claims.sessionId !== sessionId) {
    return c.json({ error: 'Token session mismatch' }, 403);
  }

  // Verify read permission (at minimum)
  if (!claims.permissions || !claims.permissions.includes('read')) {
    return c.json({ error: 'No read permission for this session' }, 403);
  }

  // Forward to DO — derive a stable DO ID from the session UUID via
  // `idFromName`. `idFromString` would only accept a 64-char hex blob.
  const doId = (c.env.AGENTIC_SESSION_DO as any).idFromName(sessionId);
  const doStub = (c.env.AGENTIC_SESSION_DO as any).get(doId);

  const wsUrl = `http://internal/ws?token=${encodeURIComponent(token)}`;
  const response = await doStub.fetch(wsUrl, {
    headers: { Upgrade: 'websocket' },
  });

  return response;
});

export default wsApi;
