/**
 * @file src/routes/api/agents/index.ts
 * @description This file aggregates all the agent-related routes.
 * @owner AI-Builder
 */

import { OpenAPIHono } from '@hono/zod-openapi'
import { Bindings } from '../../../utils/hono'
import sessionApi from './session'
import sessionStatusApi from './sessionStatus'

const agentsApi = new OpenAPIHono<{ Bindings: Bindings }>()

agentsApi.route('/', sessionApi)
agentsApi.route('/', sessionStatusApi)

export default agentsApi
