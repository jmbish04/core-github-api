import { z } from "zod";
import * as S from "./schemas/apiSchemas";
import { dispatchRPC, rpcRegistry } from "./rpc";
import type { Env } from "./types";

const ExecuteBody = z.object({ tool: z.string(), params: z.any() });

export function mcpRoutes() {
  return {
    tools: async () => {
      const tools = Object.keys(rpcRegistry).map((name) => ({
        name,
        description: `Tool for ${name}`,
        // In a real application, you would generate a more detailed schema.
        schema: {},
      }));
      return { tools };
    },
    execute: async (env: Env, ctx: ExecutionContext, body: unknown) => {
      const { tool, params } = ExecuteBody.parse(body);
      const result = await dispatchRPC(tool, params, env, ctx);
      return { success: true, result };
    },
  };
}
