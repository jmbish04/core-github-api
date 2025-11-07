/**
 * @file src/routes/api/agents/sessionStatus.ts
 * @description This file defines the route for getting the status of an agent session.
 * @owner AI-Builder
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { z } from 'zod'
import { Bindings } from '../../../utils/hono'

const sessionStatusApi = new OpenAPIHono<{ Bindings: Bindings }>()

const route = createRoute({
  method: 'get',
  path: '/session/{id}',
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
          schema: z.array(z.any()),
        },
      },
    },
  },
})

sessionStatusApi.openapi(route, async (c) => {
  const { id } = c.req.valid('param')
  const orchestrator = c.env.ORCHESTRATOR.get(
    c.env.ORCHESTRATOR.idFromName('orchestrator')
  )
  const results = await orchestrator.getStatus(id)
  return c.json(results)
})

export default sessionStatusApi
