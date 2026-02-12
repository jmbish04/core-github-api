/**
 * @file src/routes/api/agents/sessionStatus.ts
 * @description This file defines the route for getting the status of an agent session.
 * @owner AI-Builder
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { z } from 'zod'
import { Bindings } from "@utils/hono";
import { getAgentByName } from 'agents'

const sessionStatusApi = new OpenAPIHono<{ Bindings: Env }>()
type OrchestratorStub = DurableObjectStub<undefined> & {
  getStatus(id: string): Promise<unknown>;
}

const route = createRoute({
  method: 'get',
  path: '/session/{id}',
  operationId: 'getAgentSessionStatus',
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Session status',
      content: {
        'application/json': {
          schema: z.any(),
        },
      },
    },
  },
})

sessionStatusApi.openapi(route, async (c) => {
  const { id } = c.req.valid('param')
  const getByName = getAgentByName as any
  const orchestrator = await getByName(
    c.env.ORCHESTRATOR,
    'orchestrator'
  ) as OrchestratorStub
  const results = await orchestrator.getStatus(id)
  return c.json(results)
})

export default sessionStatusApi
