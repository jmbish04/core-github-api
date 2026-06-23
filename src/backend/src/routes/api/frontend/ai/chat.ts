/**
 * @file src/routes/api/chat.ts
 * @description Persistent Chat API using D1 and GeminiAgent.
 * @owner AI-Builder
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { z } from 'zod'
import { getDb } from "@db";
import { eq, desc } from 'drizzle-orm'
import { chatThreads, chatMessages } from "@/db/schemas/agents/chat";
import { v4 as uuidv4 } from 'uuid'
import { getAgentByName } from 'agents';

const chatApi = new OpenAPIHono<{ Bindings: Env }>()


// Schemas
const ThreadSchema = z.object({
    id: z.string(),
    subject: z.string().nullable(),
    repoId: z.string().nullable(),
    agentId: z.string().nullable().optional(), // Added agentId
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
    agentId: z.string().optional(), // Added agentId
    subject: z.string().optional()
})

const CreateMessageSchema = z.object({
    content: z.string(),
    repoContext: z.object({
        owner: z.string(),
        repo: z.string()
    }).optional() // Optional context for the message
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
    const { repoId, subject, agentId } = c.req.valid('json')
    const db = getDb(c.env.DB)
    const id = uuidv4()
    const timestampStarted = new Date().toISOString()

    const newThread = {
        id,
        repoId: repoId || null,
        agentId: agentId || null,
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
        200: { description: 'Message sent and reply received', content: { 'application/json': { schema: z.array(MessageSchema) } } },
        500: { description: 'Server Error', content: { 'application/json': { schema: z.object({ error: z.string(), details: z.string().optional() }) } } }
    }
}), async (c) => {
    const { threadId } = c.req.valid('param')
    const { content, repoContext } = c.req.valid('json')
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

    // 3. Determine Routing
    // Fetch thread to check agentId
    const [thread] = await db.select().from(chatThreads).where(eq(chatThreads.id, threadId)).limit(1);
    const targetAgentId = thread?.agentId || 'default'; // default to GeminiAgent

    // 4. Call Agent (Durable Object)
    let stub;
    let result: { response: string, history?: any[] } | undefined;

    try {
        const payloadString = JSON.stringify({ content, history });
        const payloadSizeBytes = new TextEncoder().encode(payloadString).length;
        const payloadSizeMB = payloadSizeBytes / (1024 * 1024);
        
        if (payloadSizeMB > 2) {
            console.warn(`[WARNING] Large chat payload detected: ${payloadSizeMB.toFixed(2)} MB`);
        }

        if (targetAgentId === 'cloudflare-docs') {
             stub = await getAgentByName(c.env.CLOUDFLARE_AGENT as any, threadId) as any;
             let context = repoContext;
             if (!context && thread?.repoId) {
                 if (thread.repoId.includes('/')) {
                     const [owner, repo] = thread.repoId.split('/');
                     context = { owner, repo };
                 }
             }
             result = await stub.chat(content, history, context);
        } else if (targetAgentId === 'automation-architect') {
             stub = await getAgentByName(c.env.DESIGN_AGENT as any, threadId) as any;
             const architectPrompt = `You are the Automation Architect for the core-github-api. 
             You help engineers scaffold new webhook automations by creating classes that extend BaseAutomation. 
             All new automations must implement a .shouldExecute() hook. Output patch-ready code in Markdown blocks.`;
             result = await stub.chat(content, history, architectPrompt);
        } else {
             // Default: GeminiAgent
             stub = await getAgentByName(c.env.DESIGN_AGENT as any, threadId) as any;
             result = await stub.chat(content, history);
        }
    } catch (error: any) {
        console.error("[Chat API Error] Failed to process request:", {
            message: error.message,
            status: error.status,
            name: error.name,
            providerData: error.data || "No additional provider data", 
        });

        return c.json({ 
            error: "Agent execution failed.", 
            details: error.message 
        }, 500);
    }
    
    if (!result) {
        return c.json({ error: "Agent execution failed (no result)." }, 500);
    }

    // 5. Save Agent Response
    await db.insert(chatMessages).values({
        threadId,
        author: 'agent',
        message: result.response,
        timestamp: new Date().toISOString()
    })

    // Return the new messages
    const newMessages: Array<z.infer<typeof MessageSchema>> = [
        {
            id: -1, 
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

    return c.json(newMessages, 200)
})

export default chatApi
