/**
 * MCP Tool Definition
 */
import { z } from "zod";

export interface MCPTool {
    name: string;
    description: string;
    inputSchema: z.ZodTypeAny; // Zod schema for validation
    examples?: Array<{
        input: Record<string, any>;
        output: Record<string, any>;
    }>;
    category: string;
    tags?: string[];
    execute?: (args: any, env: any) => Promise<any>;
}