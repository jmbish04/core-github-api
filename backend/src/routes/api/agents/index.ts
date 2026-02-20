/**
 * @file src/routes/api/agents/index.ts
 * @description This file aggregates all the agent-related routes.
 * @owner AI-Builder
 */

import { OpenAPIHono } from '@hono/zod-openapi'
import { Bindings } from "@utils/hono";
import sessionApi from './session'
import sessionStatusApi from './sessionStatus'
import chatApi from './chat'
import cloudflareChatApi from './cloudflare-chat'

const agentsApi = new OpenAPIHono<{ Bindings: Env }>()

agentsApi.route('/', sessionApi)
agentsApi.route('/', sessionStatusApi)
agentsApi.route('/', chatApi)
agentsApi.route('/', cloudflareChatApi)

export default agentsApi
