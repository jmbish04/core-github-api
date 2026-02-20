/**
 * @file src/routes/api/agents/cloudflare-chat.ts
 * @description Dedicated route for Cloudflare Docs Agent chat interaction.
 * @owner Cloudflare Docs Integration Team
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { z } from 'zod'
import { getAgentByName } from 'agents'
import { generateUuid } from "@/utils/common";

const cloudflareChatApi = new OpenAPIHono<{ Bindings: Env }>()

const CloudflareChatRequestSchema = z.object({
    message: z.string(),
    sessionId: z.string().optional(),
    history: z.array(z.object({
        role: z.string(),
        content: z.string(),
    })).optional().default([]),
    context: z.object({
        repoUrl: z.string().optional(),
    }).optional(),
})

const CloudflareChatResponseSchema = z.object({
    response: z.string(),
    sessionId: z.string(),
})

const route = createRoute({
    method: 'post',
    path: '/cloudflare-chat',
    operationId: 'chatWithCloudflareDocsAgent',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: CloudflareChatRequestSchema,
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Cloudflare Docs Agent chat response',
            content: {
                'application/json': {
                    schema: CloudflareChatResponseSchema,
                },
            },
        },
    },
})

cloudflareChatApi.openapi(route, async (c) => {
    const { message, sessionId: providedSessionId, history, context } = c.req.valid('json')

    const sessionId = providedSessionId || generateUuid()
    const getByName = getAgentByName as any
    const stub = await getByName(c.env.CLOUDFLARE_DOCS_AGENT, sessionId)

    interface ChatResult {
        response: string
    }

    // @ts-ignore - Suppress deep type instantiation due to circular Env -> index -> Env dependency
    const result = await (stub as any).chat(message, history, context) as ChatResult

    const responsePayload: z.infer<typeof CloudflareChatResponseSchema> = {
        response: result.response,
        sessionId,
    }

    return c.json(responsePayload as any)
})

export default cloudflareChatApi
