/**
 * @file sandbox-sdk/tools.ts
 * @description MCP tool definitions for sandbox operations.
 *
 * Consolidated from `ai/mcp/tools/cloudflare/sandbox/index.ts`.
 * Uses SandboxClient wrapper instead of raw getSandbox for consistency.
 */

import { z } from "zod";
import { SandboxClient } from "./client";

/**
 * Returns MCP-compatible tool definitions for sandbox exec, read, and write.
 * These are consumed by the agents toolkit registry.
 */
export function loadSandboxTools(env: Env) {
  return [
    {
      name: "sandbox_exec",
      description: "Execute a shell command in the sandbox environment",
      parameters: z.object({
        command: z.string(),
        sandboxId: z.string().optional().default("default"),
      }),
      execute: async (args: { command: string; sandboxId?: string }) => {
        const id = args.sandboxId || "default";
        const client = await SandboxClient.create(env, id);
        const result = await client.exec({ command: args.command });
        return {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
        };
      },
    },
    {
      name: "sandbox_read_file",
      description: "Read a file from the sandbox",
      parameters: z.object({
        path: z.string(),
        sandboxId: z.string().optional().default("default"),
      }),
      execute: async (args: { path: string; sandboxId?: string }) => {
        const id = args.sandboxId || "default";
        const client = await SandboxClient.create(env, id);
        const result = await client.readFile({ path: args.path });
        if (!result.success) {
          throw new Error(`Failed to read file: ${args.path}`);
        }
        return result.content;
      },
    },
    {
      name: "sandbox_write_file",
      description: "Write content to a file in the sandbox",
      parameters: z.object({
        path: z.string(),
        content: z.string(),
        sandboxId: z.string().optional().default("default"),
      }),
      execute: async (args: { path: string; content: string; sandboxId?: string }) => {
        const id = args.sandboxId || "default";
        const client = await SandboxClient.create(env, id);
        await client.writeFile({ path: args.path, content: args.content });
        return "File wrote successfully.";
      },
    },
  ];
}

/**
 * Legacy type re-export for backward compatibility.
 * Originally from `cloudflare/sandbox/types.ts`.
 */
export interface SandboxExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}
