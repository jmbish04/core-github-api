/**
 * @file backend/src/ai/mcp/tools/cloudflare/registry.ts
 * @description Central registry for all Cloudflare MCP tool modules.
 *
 * AGENT INSTRUCTION: When adding a new Cloudflare MCP tool module:
 *   1. Add a new subdirectory under `backend/src/ai/mcp/tools/cloudflare/`
 *   2. Export a `getConfig(env)` or tool-list function from its `index.ts`
 *   3. Import and register it in the `getMcpConfigs()` and/or `getAllCloudflareTools()` below.
 *   4. Import and register its `checkHealth` in `runCloudflareHealthChecks()`.
 */

import { resolveCfEnv } from "@/cloudflare/env-resolver";
import { HealthResult } from "./types";

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

// --- Health checks for each tool module ---
import { checkHealth as checkAiGatewayHealth } from "./ai-gateway/health";
import { checkHealth as checkAuditLogsHealth } from "./audit-logs/health";
import { checkHealth as checkAutoRagHealth } from "./autorag/health";
import { checkHealth as checkBindingsHealth } from "./bindings/health";
import { checkHealth as checkBrowserRenderHealth } from "./browser-render/health";
import { checkHealth as checkBuildsHealth } from "./builds/health";
import { checkHealth as checkContainersHealth } from "./containers/health";
import { checkHealth as checkDocsHealth } from "./docs/health";
import { checkHealth as checkLogpushHealth } from "./logpush/health";
import { checkHealth as checkObservabilityHealth } from "./observability/health";

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

export interface CloudflareToolHealthReport {
    overall: "healthy" | "degraded" | "unhealthy";
    tools: Record<string, HealthResult>;
    summary: { healthy: number; unhealthy: number };
}

/**
 * Run real connectivity health checks across all 10 Cloudflare MCP tool modules.
 * All checks run in parallel and failures in individual tools do not block others.
 */
export async function runCloudflareHealthChecks(env: Env): Promise<CloudflareToolHealthReport> {
    const [
        aiGateway,
        auditLogs,
        autoRag,
        bindings,
        browserRender,
        builds,
        containers,
        docs,
        logpush,
        observability,
    ] = await Promise.all([
        checkAiGatewayHealth(env).catch((e): HealthResult => ({ tool: "ai-gateway", status: "unhealthy", error: e.message, requiresAuth: true })),
        checkAuditLogsHealth(env).catch((e): HealthResult => ({ tool: "audit-logs", status: "unhealthy", error: e.message, requiresAuth: true })),
        checkAutoRagHealth(env).catch((e): HealthResult => ({ tool: "autorag", status: "unhealthy", error: e.message, requiresAuth: true })),
        checkBindingsHealth(env).catch((e): HealthResult => ({ tool: "bindings", status: "unhealthy", error: e.message, requiresAuth: true })),
        checkBrowserRenderHealth(env).catch((e): HealthResult => ({ tool: "browser-render", status: "unhealthy", error: e.message, requiresAuth: true })),
        checkBuildsHealth(env).catch((e): HealthResult => ({ tool: "builds", status: "unhealthy", error: e.message, requiresAuth: true })),
        checkContainersHealth(env).catch((e): HealthResult => ({ tool: "containers", status: "unhealthy", error: e.message, requiresAuth: true })),
        checkDocsHealth(env).catch((e): HealthResult => ({ tool: "docs", status: "unhealthy", error: e.message, requiresAuth: false })),
        checkLogpushHealth(env).catch((e): HealthResult => ({ tool: "logpush", status: "unhealthy", error: e.message, requiresAuth: true })),
        checkObservabilityHealth(env).catch((e): HealthResult => ({ tool: "observability", status: "unhealthy", error: e.message, requiresAuth: true })),
    ]);

    const tools: Record<string, HealthResult> = {
        "ai-gateway": aiGateway,
        "audit-logs": auditLogs,
        "autorag": autoRag,
        "bindings": bindings,
        "browser-render": browserRender,
        "builds": builds,
        "containers": containers,
        "docs": docs,
        "logpush": logpush,
        "observability": observability,
    };

    const values = Object.values(tools);
    const summary = {
        healthy: values.filter(t => t.status === "healthy").length,
        unhealthy: values.filter(t => t.status === "unhealthy").length,
    };

    const overall: "healthy" | "degraded" | "unhealthy" =
        summary.unhealthy === 0 ? "healthy" :
        summary.healthy > 0 ? "degraded" : "unhealthy";

    return { overall, tools, summary };
}
