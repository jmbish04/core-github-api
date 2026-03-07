/**
 * @file src/routes/api/agents/index.ts
 * @description This file aggregates all the agent-related routes.
 * @owner AI-Builder
 */

import { OpenAPIHono } from '@hono/zod-openapi'
import sessionApi from '@/routes/api/agents/session'
import sessionStatusApi from '@/routes/api/agents/sessionStatus'
import chatApi from '@/routes/api/agents/chat'
import cloudflareChatApi from '@/routes/api/agents/cloudflare-chat'
import deepResearchChatApi from '@/routes/api/agents/deep-research-chat'
import cloudflareDocsAiEditApi from '@/routes/api/agents/cloudflare-docs-ai-edit'
import cloudflareDocsRevisionsApi from '@/routes/api/agents/cloudflare-docs-revisions'
import transcribeApi from '@/routes/api/agents/transcribe'
import modelsApi from '@/routes/api/agents/models'
import workshopChatApi from '@/routes/api/agents/workshop-chat'
import specialistsApi from '@/routes/api/agents/specialists'

const agentsApi = new OpenAPIHono<{ Bindings: Env }>()

agentsApi.route('/', sessionApi)
agentsApi.route('/', sessionStatusApi)
agentsApi.route('/', chatApi)
agentsApi.route('/', cloudflareChatApi)
agentsApi.route('/', deepResearchChatApi)
agentsApi.route('/', workshopChatApi)
agentsApi.route('/cloudflare-docs/ai-edit', cloudflareDocsAiEditApi)
agentsApi.route('/cloudflare-docs/prompt-revisions', cloudflareDocsRevisionsApi)
agentsApi.route('/transcribe', transcribeApi)
agentsApi.route('/models', modelsApi)
agentsApi.route('/specialists', specialistsApi)

export default agentsApi
