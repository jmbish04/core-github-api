/**
 * @file src/gardener/ops/sandbox-registry.ts
 * @description Sandbox tool registry wrapper for the Gardener system.
 *
 * Provides diagnostic and intervention tools that agents (like the Implementer)
 * use to inspect and manage sandbox processes.
 *
 * Uses the @cloudflare/sandbox SDK via @sandbox-sdk-tools for new operations.
 * Falls back to the Supervisor DO relay for legacy operations.
 */

import { SandboxClient } from "@/ai/mcp/tools/sandbox-sdk";
import type { ProcessInfo, SandboxExecResult } from "@/ai/mcp/tools/sandbox-sdk";
import type { Sandbox } from "@cloudflare/sandbox";

export { type ProcessInfo };

export class SandboxToolRegistry {
    private client: SandboxClient;

    private constructor(client: SandboxClient) {
        this.client = client;
    }

    /**
     * @param env             The Cloudflare Worker environment bindings
     * @param sandboxId       Sandbox instance ID (e.g. sanitized repo name)
     */
    static async create(env: Env, sandboxId: string): Promise<SandboxToolRegistry> {
        const client = await SandboxClient.create(env, sandboxId, {
            normalizeId: true,
        });
        return new SandboxToolRegistry(client);
    }

    /**
     * Diagnostic Tool: Check what is actually running inside the container.
     * Essential for detecting stuck 'npm install' or 'git' processes.
     */
    async listRunningProcesses(): Promise<ProcessInfo[]> {
        return this.client.listProcesses();
    }

    /**
     * Intervention Tool: Kill all processes in the sandbox.
     */
    async killAllProcesses(): Promise<void> {
        await this.client.killAllProcesses();
    }

    /**
     * Safe Execution Tool: Runs a command with built-in "Vibe Check"
     */
    async executeSmart(command: string): Promise<{ success: boolean; output?: string; error?: string; suggestion?: string; code?: number }> {
        const result: SandboxExecResult = await this.client.exec({ command, timeoutMs: 30_000 });

        if (!result.success) {
            // Automatic "Self-Healing" logic
            if (result.stderr?.includes("package-lock.json found")) {
                return {
                    success: false,
                    error: "Lockfile conflict",
                    suggestion: "Try running with --no-package-lock or delete the lockfile first.",
                };
            }

            return { success: false, error: result.stderr, code: result.exitCode };
        }

        return { success: true, output: result.stdout };
    }

    /** Get the underlying SandboxClient for advanced operations. */
    getClient(): SandboxClient {
        return this.client;
    }
}
