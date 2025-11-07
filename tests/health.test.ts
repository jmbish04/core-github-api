import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'

import { createHealthPayload, healthHandler } from '../src/routes/health'

describe('health handler', () => {
  it('returns the expected health payload', async () => {
    const app = new Hono()
    app.get('/healthz', (c) => healthHandler(c as never))

    const response = await app.request('/healthz')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(createHealthPayload())
  })
})

