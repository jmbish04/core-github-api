import { Hono } from 'hono'
import { OpenAPIHono } from '@hono/zod-openapi'
import { z } from 'zod'

const app = new OpenAPIHono()

app.get('/healthz', (c) => c.json({ ok: true }))

// Example schema + endpoint for OpenAPI
const PingSchema = z.object({
  message: z.string().openapi({ example: 'pong' }),
})

app.openapi(
  {
    method: 'get',
    path: '/api/ping',
    request: {},
    responses: {
      200: {
        description: 'Ping',
        content: {
          'application/json': {
            schema: PingSchema,
          },
        },
      },
    },
  },
  (c) => c.json({ message: 'pong' })
)

app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    title: 'Core GitHub API',
    version: '1.0.0'
  }
})
app.doc('/openapi.yaml', {
  openapi: '3.0.0',
  info: {
    title: 'Core GitHub API',
    version: '1.0.0'
  }
})

export default app
