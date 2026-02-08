import { Client } from "@modelcontextprotocol/sdk/client/index.js";
// FIX for deprecation of SSEClientTransport: 
// Use StreamableHTTPClientTransport instead of SSEClientTransport
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { FunctionDeclaration, Type } from "@google/genai";
import { EventSource } from "eventsource";

// Polyfill EventSource for Cloudflare Workers (Still good to have for backward compatibility/negotiation)
// @ts-ignore
globalThis.EventSource = EventSource;

export interface McpConnection {
    client: Client;
    tools: FunctionDeclaration[];
}

interface McpToolResult {
    content: Array<{
        type: string;
        text?: string;
        [key: string]: any;
    }>;
    isError?: boolean;
}

/**
 * Connects to an MCP server via Streamable HTTP and returns the client and Gemini-compatible tool definitions.
 * @param url The endpoint URL of the MCP server (e.g. http://localhost:8080/mcp).
 */
export async function connectToMcpServer(url: string): Promise<McpConnection> {
    // FIX for deprecation of SSEClientTransport: 
    // Instantiate the new transport
    const transport = new StreamableHTTPClientTransport(new URL(url));

    const client = new Client(
        { name: "core-github-api-worker", version: "1.0.0" },
        { capabilities: {} }
    );

    await client.connect(transport);
    const { tools: mcpTools } = await client.listTools();

    const geminiTools: FunctionDeclaration[] = mcpTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: {
            type: Type.OBJECT,
            properties: tool.inputSchema.properties as any,
            required: tool.inputSchema.required,
        },
    }));

    return { client, tools: geminiTools };
}

/**
 * Executes an MCP tool call and formats the result as a string.
 * @param client The connected MCP client.
 * @param name The name of the tool to call.
 * @param args The arguments for the tool.
 */
export async function executeMcpTool(client: Client, name: string, args: any): Promise<string> {
    const mcpResult = (await client.callTool({
        name,
        arguments: args,
    })) as unknown as McpToolResult;

    if (!mcpResult || !mcpResult.content) {
        return "No content returned from tool execution.";
    }

    return mcpResult.content
        .filter((c) => c.type === "text")
        .map((c) => c.text || "")
        .join("\n");
}