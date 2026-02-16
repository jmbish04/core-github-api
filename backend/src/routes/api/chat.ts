/**
 * @file src/routes/api/chat.ts
 * @description Persistent Chat API using D1 and GeminiAgent.
 * @owner AI-Builder
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { z } from 'zod'
import { getDb, schema } from "@db";
import { eq, desc } from 'drizzle-orm'
import { chatThreads, chatMessages } from "@/db/schemas/agents/chat";
import { v4 as uuidv4 } from 'uuid'
import { getAgentByName } from 'agents'

const chatApi = new OpenAPIHono<{ Bindings: Env }>()

// Schemas
const ThreadSchema = z.object({
    id: z.string(),
    subject: z.string().nullable(),
    repoId: z.string().nullable(),
    timestampStarted: z.string()
})

const MessageSchema = z.object({
    id: z.number(),
    threadId: z.string(),
    role: z.enum(['user', 'agent', 'system']),
    content: z.string(),
    timestamp: z.string()
})

const CreateThreadSchema = z.object({
    repoId: z.string().optional(),
    subject: z.string().optional()
})

const CreateMessageSchema = z.object({
    content: z.string()
})

// --- 1. GET /threads ---
chatApi.openapi(createRoute({
    method: 'get',
    path: '/threads',
    operationId: 'listThreads',
    responses: {
        200: { description: 'List of chat threads', content: { 'application/json': { schema: z.array(ThreadSchema) } } }
    }
}), async (c) => {
    const db = getDb(c.env.DB)
    const threads = await db.select().from(chatThreads).orderBy(desc(chatThreads.timestampStarted)).limit(50)

    return c.json(threads.map(t => ({
        ...t,
        subject: t.subject || "New Conversation"
    })))
})

// --- 2. POST /threads ---
chatApi.openapi(createRoute({
    method: 'post',
    path: '/threads',
    operationId: 'createThread',
    request: { body: { content: { 'application/json': { schema: CreateThreadSchema } } } },
    responses: {
        200: { description: 'Created thread', content: { 'application/json': { schema: ThreadSchema } } }
    }
}), async (c) => {
    const { repoId, subject } = c.req.valid('json')
    const db = getDb(c.env.DB)
    const id = uuidv4()
    const timestampStarted = new Date().toISOString()

    const newThread = {
        id,
        repoId: repoId || null,
        subject: subject || "New Conversation",
        timestampStarted
    }

    await db.insert(chatThreads).values(newThread)

    return c.json(newThread)
})

// --- 3. GET /threads/:threadId/messages ---
chatApi.openapi(createRoute({
    method: 'get',
    path: '/threads/{threadId}/messages',
    operationId: 'listMessages',
    request: { params: z.object({ threadId: z.string() }) },
    responses: {
        200: { description: 'List of messages', content: { 'application/json': { schema: z.array(MessageSchema) } } }
    }
}), async (c) => {
    const { threadId } = c.req.valid('param')
    const db = getDb(c.env.DB)

    const messages = await db.select().from(chatMessages)
        .where(eq(chatMessages.threadId, threadId))
        .orderBy(chatMessages.id) // Chronological

    return c.json(messages.map(m => ({
        id: m.id,
        threadId: m.threadId,
        role: m.author as 'user' | 'agent' | 'system',
        content: m.message,
        timestamp: m.timestamp
    })))
})

// --- 4. POST /threads/:threadId/messages (Send & Reply) ---
chatApi.openapi(createRoute({
    method: 'post',
    path: '/threads/{threadId}/messages',
    operationId: 'sendMessage',
    request: {
        params: z.object({ threadId: z.string() }),
        body: { content: { 'application/json': { schema: CreateMessageSchema } } }
    },
    responses: {
        200: { description: 'Message sent and reply received', content: { 'application/json': { schema: z.array(MessageSchema) } } }
    }
}), async (c) => {
    const { threadId } = c.req.valid('param')
    const { content } = c.req.valid('json')
    const db = getDb(c.env.DB)
    const timestamp = new Date().toISOString()

    // 1. Save User Message
    await db.insert(chatMessages).values({
        threadId,
        author: 'user',
        message: content,
        timestamp
    })

    // 2. Fetch History (Role mapping: user->user, agent->model)
    const historyRows = await db.select().from(chatMessages)
        .where(eq(chatMessages.threadId, threadId))
        .orderBy(chatMessages.id)

    const history = historyRows.map(h => ({
        role: h.author === 'agent' ? 'model' : 'user', // Map for Gemini
        content: h.message
    }))

    // 3. Call Agent (Durable Object)
    // We use the threadId as the sessionId for the DO to keep ephemeral state in sync if needed
    const getByName = getAgentByName as any
    const stub = await getByName(c.env.GEMINI_AGENT, threadId)

    // @ts-ignore - DO method access
    const result = await stub.chat(content, history) as { response: string, history: any[] }

    // 4. Save Agent Response
    await db.insert(chatMessages).values({
        threadId,
        author: 'agent',
        message: result.response,
        timestamp: new Date().toISOString()
    })

    // Return the new messages (User + Agent)
    // Actually, let's just return the Agent message or the updated list? 
    // Usually easier to return the new ones.
    // For simplicity, let's return the simplified Message objects for the two new messages.

    const newMessages: Array<z.infer<typeof MessageSchema>> = [
        {
            id: -1, // placeholder, we don't need real ID for immediate UI update usually, or we query DB again
            threadId,
            role: 'user',
            content,
            timestamp
        },
        {
            id: -2,
            threadId,
            role: 'agent',
            content: result.response,
            timestamp: new Date().toISOString()
        }
    ]

    return c.json(newMessages)
})

export default chatApi
