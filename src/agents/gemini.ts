/**
 * @file src/agents/gemini.ts
 * @description Gemini Agent capable of using tools to manage GitHub repositories.
 * @owner AI-Builder
 */

import { Agent } from 'agents'
import { Context } from 'hono'
import { v4 as uuidv4 } from 'uuid'
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { createGeminiClient } from "../lib/gemini";
import toolsApi from '../tools/index'

// Define the tool schemas
const CreateRepoSchema = z.object({
    owner: z.string().default("jmbish04"),
    name: z.string(),
    description: z.string().optional(),
    private: z.boolean().default(false),
    auto_init: z.boolean().default(true)
});

const RetrofitSchema = z.object({
    owner: z.string().default("jmbish04"),
    repos: z.array(z.string()).optional(),
    force: z.boolean().default(false)
});

const ListCommentsSchema = z.object({
    owner: z.string().default("jmbish04"),
    repo: z.string(),
    number: z.number().int()
});

const CreateCommentSchema = z.object({
    owner: z.string().default("jmbish04"),
    repo: z.string(),
    number: z.number().int(),
    body: z.string(),
    path: z.string().optional(),
    line: z.number().int().optional()
});

const SaveCommentsKvSchema = z.object({
    key: z.string(),
    comments: z.array(z.any())
});

const GetCommentsKvSchema = z.object({
    key: z.string()
});

const ReplySchema = z.object({
    message: z.string()
});

const SearchDocsSchema = z.object({
    query: z.string().describe("The query to search in Cloudflare documentation.")
});

// Comprehensive Agent Action Schema
// We use a discriminated union to force the model to pick a specific tool signature.
const AgentActionSchema = z.discriminatedUnion("tool", [
    z.object({ tool: z.literal("create_repo"), arguments: CreateRepoSchema }),
    z.object({ tool: z.literal("retrofit_workflows"), arguments: RetrofitSchema }),
    z.object({ tool: z.literal("list_pr_comments"), arguments: ListCommentsSchema }),
    z.object({ tool: z.literal("create_pr_comment"), arguments: CreateCommentSchema }),
    z.object({ tool: z.literal("save_comments_kv"), arguments: SaveCommentsKvSchema }),
    z.object({ tool: z.literal("get_comments_kv"), arguments: GetCommentsKvSchema }),
    z.object({ tool: z.literal("search_documentation"), arguments: SearchDocsSchema }),
    // "reply" is a virtual tool that acts as the final response to the user
    z.object({ tool: z.literal("reply"), arguments: ReplySchema })
]);

const SYSTEM_PROMPT = `
You are a helpful GitHub assistant powered by Gemini.
You have access to Cloudflare documentation via the 'search_documentation' tool.
USE IT whenever the user asks about Cloudflare Workers, Pages, D1, etc.
You can help the user create repositories, check PRs, fix conflicts, and manage workflows.

You must respond with a JSON object describing the action to take.
If you simply want to talk to the user, use the 'reply' tool.
`;

export class GeminiAgent extends Agent {
    constructor(ctx: any, env: any) {
        super(ctx, env)
    }

    /**
     * Main chat entrypoint
     */
    async chat(userMessage: string, history: any[] = []) {
        const ai = createGeminiClient(this.env as any); // Cast to any or Bindings if imported
        const jsonSchema = zodToJsonSchema(AgentActionSchema);

        // Lazy load MCP client only if needed? Or just create it once.
        // For performance, we might want to keep it alive or create it per request. 
        // We'll create it if 'search_documentation' is called, or simple:
        // Actually, we need to handle the execution of it.

        const messages = [
            { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
            ...history.map(msg => ({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
            })),
            { role: 'user', parts: [{ text: userMessage }] }
        ];

        // Tool execution loop
        let loops = 0;
        const MAX_LOOPS = 5;
        const newHistory = [...history, { role: 'user', content: userMessage }];

        // We might need to connect to MCP if the tool is called.
        // We'll import dynamically or just have it ready.
        const { connectToMcpServer, executeMcpTool } = await import("../lib/mcp-client");
        let mcpClient: any = null;

        while (loops < MAX_LOOPS) {
            try {
                // Cast env to any to access GEMINI_MODEL which should be there at runtime
                const model = (this.env as any).GEMINI_MODEL || "gemini-2.0-flash-exp";

                const result = await ai.models.generateContent({
                    model: model,
                    contents: messages as any, // Cast to any to avoid stricter type overlap issues with @google/genai parts
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: jsonSchema as any,
                    },
                });

                // result.text is a function in the Google GenAI SDK (for response helpers)
                // BUT previous errors suggested it might be a property in some contexts? 
                // The error "This expression is not callable ... Type 'String' has no call signatures"
                // implies result.text IS A STRING.
                // However, looking at the PlannerAgent fix, I might have assumed wrong or right.
                // Let's check safely.
                // The error 'Type String has no call signatures' implies result.text IS A string (the getter was accessed).
                // If it were a method, we'd call it.
                // TypeScript might be confused if we try to call it.
                // Correct usage per SDK is just accessing the property if it's a getter, 
                // OR result.response.text() if we want the method from the underlying response.
                // 'generateContent' returns 'GenerateContentResponse'.
                // The SDK helper normally puts .text on it.
                const responseText = (result as any).text || "";

                // Parse the strictly structured response
                const action = JSON.parse(responseText);

                // Check for 'reply' (final answer)
                if (action.tool === 'reply') {
                    const content = action.arguments.message;
                    newHistory.push({ role: 'assistant', content });
                    return {
                        response: content,
                        history: newHistory
                    };
                }

                // Execute other tools
                console.log(`[GeminiAgent] Executing tool: ${action.tool}`);
                newHistory.push({ role: 'assistant', content: JSON.stringify(action) });
                messages.push({ role: 'model', parts: [{ text: JSON.stringify(action) }] });

                try {
                    let toolResult;

                    if (action.tool === 'search_documentation') {
                        // MCP Tool Logic
                        if (!mcpClient) {
                            const conn = await connectToMcpServer("https://docs.mcp.cloudflare.com/sse");
                            mcpClient = conn.client;
                        }
                        toolResult = await executeMcpTool(mcpClient, 'search_documentation', action.arguments);
                    } else {
                        // Standard GitHub Tools
                        toolResult = await this.executeTool(action.tool, action.arguments);
                    }

                    const resultStr = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);

                    const toolOutputMsg = `Tool '${action.tool}' Output: ${resultStr}`;
                    newHistory.push({
                        role: 'user', // representing tool output context
                        content: toolOutputMsg
                    });
                    messages.push({ role: 'user', parts: [{ text: toolOutputMsg }] });
                } catch (error: any) {
                    const errorMsg = `Tool '${action.tool}' Error: ${error.message}`;
                    newHistory.push({
                        role: 'user',
                        content: errorMsg
                    });
                    messages.push({ role: 'user', parts: [{ text: errorMsg }] });
                }

            } catch (error: any) {
                console.error("[GeminiAgent] Error:", error);
                return { response: `Error: ${error.message}`, history: newHistory };
            }

            loops++;
        }

        return { response: "I reached the maximum number of steps.", history: newHistory };
    }

    /**
     * Execute tool by calling internal API routes
     */
    async executeTool(name: string, args: any): Promise<any> {
        const { WORKER_API_KEY } = this.env as any; // Cast to any or Bindings
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'x-api-key': WORKER_API_KEY || ''
            // Auth headers will be handled by the route or we act as admin since we are the worker
        };

        // Map tool names to endpoints relative to toolsApi mount
        let url = '';
        let method = 'POST';
        let body = JSON.stringify(args);
        // let query = ''; // This variable is no longer needed as query params are built directly into the URL

        switch (name) {
            case 'create_repo':
                url = '/github/repos/create';
                break;
            case 'retrofit_workflows':
                url = '/github/repos/retrofit';
                break;
            case 'list_pr_comments':
                method = 'GET';
                // Construct query string
                const q = new URLSearchParams({
                    owner: args.owner,
                    repo: args.repo,
                    number: args.number.toString()
                });
                url = `/prs/comments/list?${q.toString()}`;
                body = undefined as any;
                break;
            case 'create_pr_comment':
                url = '/prs/comments/create';
                break;
            case 'save_comments_kv':
                url = '/kv/comments/save';
                break;
            case 'get_comments_kv':
                method = 'GET';
                const qKv = new URLSearchParams({ key: args.key });
                url = `/kv/comments/get?${qKv.toString()}`;
                body = undefined as any;
                break;
            default:
                throw new Error(`Unknown tool: ${name}`);
        }

        // Call the toolsApi using internal fetch
        const req = new Request(`http://localhost${url}`, {
            method,
            headers,
            body
        });

        const res = await toolsApi.fetch(req, this.env, this.ctx as any);

        if (!res.ok) {
            const txt = await res.text();
            throw new Error(`Tool request failed: ${res.status} ${txt}`);
        }

        return await res.json();
    }
}
