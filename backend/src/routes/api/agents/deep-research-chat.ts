/**
 * @file src/routes/api/agents/deep-research-chat.ts
 * @description Dedicated route for Deep Research Agent chat interaction.
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { z } from 'zod'
import { getAgentByName } from 'agents'
import { generateUuid } from "@/utils/common";

const deepResearchChatApi = new OpenAPIHono<{ Bindings: Env }>({
    defaultHook: (result, c) => {
        if (!result.success) {
            return c.json(
                {
                    error: "Validation failed",
                    details: (result.error as any).errors || (result.error as any).issues || result.error,
                },
                400
            );
        }
    }
})

const DeepResearchChatRequestSchema = z.object({
    message: z.string(),
    sessionId: z.string().optional(),
    history: z.array(z.object({
        role: z.string(),
        content: z.string(),
    })).optional().default([]),
    context: z.object({
        repoUrl: z.string().optional(),
    }).optional(),
    /** Surface that originated this request */
    source: z.string().optional().default("api"),
})

const DeepResearchChatResponseSchema = z.object({
    response: z.string(),
    blocks: z.array(z.object({
        type: z.enum(['section_header', 'text', 'codeblock']),
        text: z.string(),
        language: z.string().optional(),
    })).optional(),
    followupPrompts: z.array(z.string()),
    sessionId: z.string(),
    modelUsed: z.string(),
})

const route = createRoute({
    method: 'post',
    path: '/deep-research-chat',
    operationId: 'chatWithDeepResearchAgent',
    request: {
        body: {
            content: { 'application/json': { schema: DeepResearchChatRequestSchema } },
        },
    },
    responses: {
        200: {
            description: 'Deep Research Agent chat response',
            content: { 'application/json': { schema: DeepResearchChatResponseSchema } },
        },
        400: {
            description: 'Validation Error',
            content: { 'application/json': { schema: z.object({ error: z.string(), details: z.any().optional() }) } },
        },
        500: {
            description: 'Internal Server Error',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } },
        },
    },
})

deepResearchChatApi.openapi(route, async (c) => {
    try {
        const { message, sessionId: providedSessionId, history, context, source } = c.req.valid('json')

        const sessionId = providedSessionId || generateUuid()
        const getByName = getAgentByName as any
        const stub = await getByName(c.env.DEEP_RESEARCH_CHAT_AGENT, sessionId)

        interface ChatResult {
            blocks?: Array<{ type: string; text: string; language?: string }>;
            response: string;
            followupPrompts: string[];
            modelUsed: string;
            sessionId: string;
        }

        // @ts-ignore - Suppress deep type instantiation
        const result = await (stub as any).chat(message, history, context, source, sessionId) as ChatResult

        return c.json({
            blocks: result.blocks ?? [],
            response: result.response,
            followupPrompts: result.followupPrompts ?? [],
            sessionId: result.sessionId ?? sessionId,
            modelUsed: result.modelUsed ?? "unknown",
        } as any)
    } catch (err: any) {
        console.error('[deep-research-chat] Unhandled exception:', err);
        return c.json({ error: err.message || 'An unexpected error occurred communicating with the Deep Research Agent.' } as any, 500);
    }
})

export default deepResearchChatApi;
