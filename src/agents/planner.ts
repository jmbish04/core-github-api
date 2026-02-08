
import { Agent } from "agents";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { Bindings } from "../utils/hono";
import { createGeminiClient } from "../lib/gemini";
import { connectToMcpServer, executeMcpTool } from "../lib/mcp-client";

// Define the output schema for the plan
const PlanSchema = z.object({
    title: z.string().describe("The comprehensive title of the plan"),
    steps: z.array(z.object({
        id: z.string().describe("Unique identifier for the step (e.g., step-1)"),
        description: z.string().describe("Detailed description of what needs to be done"),
        difficulty: z.enum(["easy", "medium", "hard"]).describe("Estimated difficulty level"),
        command: z.string().optional().describe("CLI command provided if applicable")
    })).describe("Sequential steps to achieve the goal")
});

export class PlannerAgent extends Agent<Bindings> {
    async onRequest(request: Request) {
        // 1. Get the goal from the internal request
        let goal = "";
        try {
            const body = await request.json() as { goal: string };
            goal = body.goal;
        } catch (e) {
            return new Response("Invalid request body", { status: 400 });
        }

        const ai = createGeminiClient(this.env);

        try {
            // 2. Connect to Cloudflare Docs MCP
            const { client: mcpClient, tools: mcpTools } = await connectToMcpServer("https://docs.mcp.cloudflare.com/sse");

            // 3. Start a chat session with tools
            // 3. Start a chat session with tools
            const chat = ai.chats.create({
                model: this.env.GEMINI_MODEL || "gemini-2.0-flash-exp",
                history: [
                    {
                        role: "user",
                        parts: [{
                            text: `You are a Senior Cloudflare Engineer. Create a detailed technical plan for: "${goal}".
                            
                            CRITICAL INSTRUCTION:
                            Before generating the final plan, you MUST verify any/all Cloudflare - specific implementation details(like syntax, bindings, or configuration) using the 'search_documentation' tool. 
                            Do not guess. Verify first. Required starting queries for cloudflare docs mcp:
                             - "Proper typescript handling of wrangler.jsonc/wrangler.toml Cloudflare bindings (eg, D1, KV, R2, AI, etc.) using 'wrangler types'"
                             - "Cloudflare Agents SDK to implement long running agentic workflows, stateful sessions, and durable objects"

                            Once you are confident, output the final plan as a JSON object matching this schema:
                            ${JSON.stringify(zodToJsonSchema(PlanSchema))}
                            `
                        }]
                    }
                ],
                config: {
                    tools: [{ functionDeclarations: mcpTools }]
                }
            });

            // 4. Execution Loop (ReAct)
            // We need to loop to allow tool calls.
            // Since we want the final output to be JSON, we ask for it in the prompt, 
            // but we can't easily enforce 'responseSchema' on the *intermediate* steps 
            // because the model needs to output tool calls first (which are not the JSON schema).
            // So we rely on the prompt to output JSON *only at the end*.

            let result = await chat.sendMessage({ message: [{ text: "Proceed with verification and planning." }] });
            let loops = 0;
            const MAX_LOOPS = 5;

            while (loops < MAX_LOOPS) {
                // @ts-ignore - functionCalls() helper might be missing on type def but exist at runtime, or we need to access parts manually. 
                // In new SDK, result IS the response. Check if functionCalls() exists or use candidates.
                // Safest is to try accessing if available, or check candidates.
                // Let's assume result (GenerateContentResponse) has the helper or we use it directly.
                // The error was 'Property response does not exist', so we remove .response.
                // If functionCalls() doesn't exist on result, we might need another fix.
                // For now, let's try direct access and ignore TS if needed or safer: parse candidates.
                const calls = (result as any).functionCalls ? (result as any).functionCalls() : null;

                // If no function calls, we assume it's the final response (the JSON plan)
                // or a text response. We check if we can parse it as our Plan.
                if (!calls || calls.length === 0) {
                    break;
                }

                // Process tool calls
                const functionResponses = await Promise.all(
                    calls.map(async (call: any) => {
                        console.log(`[PlannerAgent] Calling tool: ${call.name} `);
                        try {
                            const content = await executeMcpTool(mcpClient, call.name, call.args);
                            return {
                                name: call.name,
                                response: { name: call.name, content: content }
                            };
                        } catch (err: any) {
                            return {
                                name: call.name,
                                response: { name: call.name, content: `Error: ${err.message} ` }
                            };
                        }
                    })
                );

                result = await chat.sendMessage({ message: [{ text: JSON.stringify(functionResponses) }] });
                loops++;
            }

            // 5. Extract and Validate Final JSON
            const finalFiles = (result as any).text ? (result as any).text() : "";

            // Cleanup standard markdown code fencing if present
            const jsonStr = finalFiles.replace(/```json\n?|\n?```/g, "").trim();

            // Validate against schema just to be sure, or just return it
            return new Response(jsonStr, {
                headers: { "content-type": "application/json" }
            });

        } catch (error: any) {
            console.error("[PlannerAgent] Error:", error);
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { "content-type": "application/json" }
            });
        }
    }
}
