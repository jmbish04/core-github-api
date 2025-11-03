/**
 * @file src/routes/api/agents/session.ts
 * @description This file defines the route for creating a new agent session.
 * @owner AI-Builder
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { z } from 'zod'
import { Bindings } from '../../../utils/hono'

const sessionApi = new OpenAPIHono<{ Bindings: Bindings }>()

const route = createRoute({
  method: 'post',
  path: '/session',
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
  const orchestrator = c.env.ORCHESTRATOR.get(
    c.env.ORCHESTRATOR.idFromName('orchestrator')
  )
  const { sessionId } = await orchestrator.start(prompt)
  return c.json({ sessionId })
})

export default sessionApi
