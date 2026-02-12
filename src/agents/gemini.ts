/**
 * @file src/agents/gemini.ts
 * @description Gemini Agent capable of using tools to manage GitHub repositories.
 * @owner AI-Builder
 */

import { Agent } from 'agents'
import { Context } from 'hono'
import { v4 as uuidv4 } from 'uuid'
import toolsApi from '../tools/index'

// Define the system prompt with tool definitions
const SYSTEM_PROMPT = `
You are a helpful GitHub assistant powered by Gemini.
You can help the user create repositories, check PRs, fix conflicts, and manage workflows.

You have access to the following tools. To use a tool, respond with a JSON block:
\`\`\`json
{
  "tool": "tool_name",
  "arguments": { ... }
}
\`\`\`

Tools available:

1. create_repo
   - Arguments: owner (string), name (string), description (optional string), private (boolean, default false), auto_init (boolean, default true)
   - Description: Create a new GitHub repository.

2. retrofit_workflows
   - Arguments: owner (string), repos (array of strings, optional), force (boolean, default false)
   - Description: Add default workflows to existing repositories.

3. list_pr_comments
   - Arguments: owner (string), repo (string), number (integer)
   - Description: List all comments on a Pull Request.

4. create_pr_comment
   - Arguments: owner (string), repo (string), number (integer), body (string), path (optional string), line (optional integer)
   - Description: Create a comment on a PR. Use path/line for code review comments.

5. save_comments_kv
   - Arguments: key (string), comments (array)
   - Description: Save a list of comments to KV storage for later retrieval.

6. get_comments_kv
   - Arguments: key (string)
   - Description: Retrieve comments from KV.

If you don't need to use a tool, just respond with your text message.
Always verify the success of tool calls.
`

export class GeminiAgent extends Agent {
    constructor(ctx: any, env: any) {
        super(ctx, env)
    }

    /**
     * Main chat entrypoint
     */
    async chat(userMessage: string, history: any[] = []) {
        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...history,
            { role: 'user', content: userMessage }
        ];

        // Tool execution loop
        let loops = 0;
        const MAX_LOOPS = 5;

        while (loops < MAX_LOOPS) {
            // 1. Call Gemini
            const response = await this.env.AI.run('@cf/google/gemini-2.0-flash-exp', {
                messages
            });

            // Handle response format (stream or string or object)
            // Adjust based on actual AI binding return type. Assuming standard text/object.
            // For @cf/google/gemini-2.0-flash-exp, it usually returns { response: string } or stream.
            let content = '';
            if (typeof response === 'string') content = response;
            else if ((response as any).response) content = (response as any).response;

            // 2. Parse for Tool Calls
            const toolCall = this.parseToolCall(content);

            if (!toolCall) {
                // No tool call, return final answer
                return {
                    response: content,
                    history: [...messages, { role: 'assistant', content }]
                };
            }

            // 3. Execute Tool
            messages.push({ role: 'assistant', content }); // Add the tool call request to history
            console.log(`[GeminiAgent] Executing tool: ${toolCall.tool}`);

            try {
                const result = await this.executeTool(toolCall.tool, toolCall.arguments);
                const resultStr = JSON.stringify(result);

                messages.push({
                    role: 'user', // representing tool output as user message for context
                    content: `Tool '${toolCall.tool}' Output: ${resultStr}`
                });
            } catch (error: any) {
                messages.push({
                    role: 'user',
                    content: `Tool '${toolCall.tool}' Error: ${error.message}`
                });
            }

            loops++;
        }

        return { response: "I reached the maximum number of steps.", history: messages };
    }

    /**
     * Helper to parse markdown JSON tool calls
     */
    parseToolCall(content: string): { tool: string, arguments: any } | null {
        const match = content.match(/```json\s*([\s\S]*?)\s*```/);
        if (!match) return null;
        try {
            const json = JSON.parse(match[1]);
            if (json.tool && json.arguments) return json;
        } catch {
            return null;
        }
        return null;
    }

    /**
     * Execute tool by calling internal API routes
     */
    async executeTool(name: string, args: any): Promise<any> {
        const { WORKER_API_KEY } = this.env;
        const headers = {
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

        const res = await toolsApi.fetch(req, this.env, this.ctx);

        if (!res.ok) {
            const txt = await res.text();
            throw new Error(`Tool request failed: ${res.status} ${txt}`);
        }

        return await res.json();
    }
}
