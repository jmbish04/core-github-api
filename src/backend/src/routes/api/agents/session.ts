/**
 * @file src/routes/api/agents/session.ts
 * @description This file defines the route for creating a new agent session.
 * @owner AI-Builder
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { z } from 'zod'

import { HoniClient } from '@utils/honi-client';

const sessionApi = new OpenAPIHono<{ Bindings: Env }>()
type OrchestratorStub = DurableObjectStub<undefined> & {
  start(prompt: string): Promise<{ sessionId: string }>;
}

const route = createRoute({
  method: 'post',
  path: '/session',
  operationId: 'createAgentSession',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            prompt: z.string(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Session started',
      content: {
        'application/json': {
          schema: z.object({
            sessionId: z.string(),
          }),
        },
      },
    },
  },
})

sessionApi.openapi(route, async (c) => {
  const { prompt } = c.req.valid('json')
  const orchestrator = HoniClient.getStub(
    c.env.ORCHESTRATOR as any,
    'orchestrator'
  ) as OrchestratorStub
  const { sessionId } = await orchestrator.start(prompt)
  return c.json({ sessionId })
})

export default sessionApi
