/**
 * @file src/routes/api/agents/index.ts
 * @description This file aggregates all the agent-related routes.
 * @owner AI-Builder
 */

import { OpenAPIHono } from '@hono/zod-openapi'
import sessionApi from '@/routes/api/agents/session'
import sessionStatusApi from '@/routes/api/agents/sessionStatus'
import chatApi from '@/routes/api/agents/chat'
import deepResearchChatApi from '@/routes/api/agents/deep-research-chat'
import transcribeApi from '@/routes/api/agents/transcribe'
import modelsApi from '@/routes/api/agents/models'
import workshopChatApi from '@/routes/api/agents/workshop-chat'
import specialistsApi from '@/routes/api/agents/specialists'
import statusApi from '@/routes/api/agents/status'
import agentConfigApi from '@/routes/api/agents/config'
import traceabilityApi from '@/routes/api/agents/traceability'
import agentHealthApi from '@/routes/api/agents/health'

const agentsApi = new OpenAPIHono<{ Bindings: Env }>()

agentsApi.route('/', sessionApi)
agentsApi.route('/', sessionStatusApi)
agentsApi.route('/', chatApi)
agentsApi.route('/', deepResearchChatApi)
agentsApi.route('/', workshopChatApi)
agentsApi.route('/transcribe', transcribeApi)
agentsApi.route('/models', modelsApi)
agentsApi.route('/specialists', specialistsApi)
agentsApi.route('/status', statusApi)
agentsApi.route('/config', agentConfigApi)
agentsApi.route('/traceability', traceabilityApi)
agentsApi.route('/health', agentHealthApi)

export default agentsApi
