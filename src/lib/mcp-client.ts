
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { FunctionDeclaration, Type } from "@google/genai";
import { EventSource } from "eventsource";

// Polyfill EventSource for Cloudflare Workers
// @ts-ignore
globalThis.EventSource = EventSource;

export interface McpConnection {
    client: Client;
    tools: FunctionDeclaration[];
}

export async function connectToMcpServer(url: string): Promise<McpConnection> {
    const transport = new StreamableHTTPClientTransport(new URL(url));
    const client = new Client({
        name: "gemini-worker-client",
        version: "1.0.0",
    }, {
        capabilities: {},
    });

    await client.connect(transport);

    const result = await client.listTools();
    const mcpTools = result.tools;

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

export async function executeMcpTool(client: Client, name: string, args: any): Promise<string> {
    const mcpResult = await client.callTool({
        name,
        arguments: args,
    }) as CallToolResult;

    return mcpResult.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");
}
