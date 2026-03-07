/**
 * @file backend/src/ai/mcp/tools/cloudflare/registry.ts
 * @description Central registry for all Cloudflare MCP tool modules.
 *
 * AGENT INSTRUCTION: When adding a new Cloudflare MCP tool module:
 *   1. Add a new subdirectory under `backend/src/ai/mcp/tools/cloudflare/`
 *   2. Export a `getConfig(env)` or tool-list function from its `index.ts`
 *   3. Import and register it in the `getMcpConfigs()` and/or `getAllCloudflareTools()` below.
 */

import { resolveCfEnv } from "@/cloudflare/env-resolver";

// --- Remote MCP streamable-http server configs (11 modules) ---
import { getConfig as getAiGatewayConfig } from "./ai-gateway/index";
import { getConfig as getAuditLogsConfig } from "./audit-logs/index";
import { getConfig as getAutoRagConfig } from "./autorag/index";
import { getConfig as getBindingsConfig, getBindingTools } from "./bindings/index";
import { getConfig as getBrowserConfig, getBrowserTools } from "./browser-render/index";
import { getConfig as getBuildsConfig } from "./builds/index";
import { getConfig as getContainersConfig } from "./containers/index";
import { getConfig as getDocsConfig } from "./docs/index";
import { getConfig as getLogpushConfig } from "./logpush/index";
import { getConfig as getObservabilityConfig } from "./observability/index";
import { loadSandboxTools } from "./sandbox/index";
import { checkHealth } from "./ai-gateway/health";

export interface CloudflareMcpConfig {
    name: string;
    url?: string;
    transport?: { type: string; headers?: Record<string, string> };
    tools?: any[];
}

/**
 * Returns all remote MCP server configs (for use with addMcpServer / Agent SDK).
 * Each item with a `url` will be wired as a remote streamable-http MCP server.
 * Items with only `tools` are local tool arrays (browser-render, sandbox).
 */
export async function getMcpConfigs(env: Env): Promise<CloudflareMcpConfig[]> {
    const resolved = await resolveCfEnv(env);

    // Build configs using the resolved plain-string env so tokens are actual strings
    const fakeEnv = resolved as unknown as Env;

    return [
        getAiGatewayConfig(fakeEnv),
        getAuditLogsConfig(fakeEnv),
        getAutoRagConfig(fakeEnv),
        getBindingsConfig(fakeEnv),
        getBrowserConfig(fakeEnv),
        getBuildsConfig(fakeEnv),
        getContainersConfig(fakeEnv),
        getDocsConfig(fakeEnv),
        getLogpushConfig(fakeEnv),
        getObservabilityConfig(fakeEnv),
    ];
}

/**
 * Returns all local Cloudflare tool definitions (Zod-schema based, for Agent SDK).
 * These are tools that run inline in the Worker (not via remote MCP server).
 */
export function getAllCloudflareTools(env: Env) {
    return [
        ...getBindingTools(env),
        ...getBrowserTools(env),
        ...loadSandboxTools(env),
    ];
}

/**
 * Run a health check across all Cloudflare tool modules that expose a checkHealth function.
 */
export async function runCloudflareHealthChecks(env: Env) {
    const [aiGateway] = await Promise.all([
        checkHealth(env),
    ]);

    return {
        "ai-gateway": aiGateway,
    };
}
