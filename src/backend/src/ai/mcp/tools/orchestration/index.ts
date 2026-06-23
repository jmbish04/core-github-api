/**
 * @file src/mcp/tools/orchestration/index.ts
 * @description Method of orchestration tools (sessions, agents)
 */
import { AskCloudflareTool } from "./toolbox/cloudflare-docs";

import { z } from "zod";
import * as S from "@/schemas/apiSchemas";

export const ORCHESTRATION_TOOLS = [
    AskCloudflareTool,

    {
        name: "createSession",
        description: "Create a new agent session for GitHub search and analysis",
        category: "Agent Orchestration",
        tags: ["agents", "sessions", "orchestration"],
        inputSchema: S.CreateSessionRequest,
        examples: [
            {
                input: {
                    projectId: "my-project",
                    searchTerms: ["cloudflare workers", "durable objects"],
                    options: {
                        maxResults: 100,
                    },
                },
                output: {
                    success: true,
                    session: {
                        id: "550e8400-e29b-41d4-a716-446655440000",
                        status: "active",
                    },
                },
            },
        ],
    },
    {
        name: "getSessionStatus",
        description: "Get the status of an agent session",
        category: "Agent Orchestration",
        tags: ["agents", "sessions", "status"],
        inputSchema: z.object({
            sessionId: z.string().uuid().describe("Session ID (UUID)"),
        }),
        examples: [
            {
                input: {
                    sessionId: "550e8400-e29b-41d4-a716-446655440000",
                },
                output: {
                    success: true,
                    session: {
                        id: "550e8400-e29b-41d4-a716-446655440000",
                        status: "completed",
                    },
                },
            },
        ],
    }    
];

export * from "./toolbox/cloudflare-docs";
