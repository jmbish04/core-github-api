/**
 * @file src/routes/api/agents/chat.ts
 * @description Route for Gemini Agent chat interaction.
 * @owner AI-Builder
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { z } from 'zod'

const chatApi = new OpenAPIHono<{ Bindings: Env }>()

const ChatRequestSchema = z.object({
    message: z.string(),
    sessionId: z.string().optional(),
    history: z.array(z.unknown()).optional().default([]), // Allow passing history from client if needed, or rely on DO state
})

const ChatResponseSchema = z.object({
    response: z.string(),
    sessionId: z.string(),
    history: z.array(z.unknown()),
})

const route = createRoute({
    method: 'post',
    path: '/chat',
    operationId: 'chatWithGemini',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: ChatRequestSchema,
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Chat response',
            content: {
                'application/json': {
                    schema: ChatResponseSchema,
                },
            },
        },
    },
})

chatApi.openapi(route, async (c) => {
    const { message, sessionId: providedSessionId, history } = c.req.valid('json')

    const sessionId = providedSessionId || crypto.randomUUID()
    const stubId = c.env.GEMINI_AGENT.idFromName(sessionId)
    const stub = c.env.GEMINI_AGENT.get(stubId)

    // Define the expected return type from the Durable Object
    interface ChatResult {
        response: string
        history: any[]
    }

    // Call the chat method.
    // Note: We need to cast stub to any or define the interface because it's a DO.
    // We assume 'chat' is a method on the DO.
    // @ts-ignore - Suppress deep type instantiation due to circular Env -> index -> Env dependency
    const result = await (stub as any).chat(message, history) as ChatResult

    const responsePayload: z.infer<typeof ChatResponseSchema> = {
        response: result.response,
        sessionId,
        history: result.history
    }

    return c.json(responsePayload as any)
})

export default chatApi
