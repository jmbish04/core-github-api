/**
 * MCP Health Check Suite
 *
 * Validates the operational status of the full MCP domain, including:
 * 1. Connectivity to the documentation fetcher (external).
 * 2. Protocol compliance of the MCP server endpoint.
 * 3. All Cloudflare MCP tool integrations (10 tools, real API calls).
 * 4. All GitHub MCP tool integrations (6 read-only API checks).
 *
 * @module AI/MCP/Health
 */
import { HealthStepResult } from "@/health/types";
import { fetchCloudflareDocsIndex } from "./tools/browser/docs-fetcher";
import { createMCPRequest } from "./mcp-client";
import { runCloudflareHealthChecks } from "./tools/cloudflare/registry";
import { checkGitHubToolsHealth } from "./tools/github/tools-health";

/**
 * Checks the health of the MCP domain.
 */
export async function checkHealth(env: Env): Promise<HealthStepResult> {
    const start = Date.now();
    const subChecks: Record<string, any> = {};

    // --- 1. Docs Fetcher (External) ---
    const docsStart = Date.now();
    try {
        const sections = await fetchCloudflareDocsIndex();
        if (!Array.isArray(sections) || sections.length === 0) {
            throw new Error("fetchCloudflareDocsIndex returned empty/invalid list");
        }
        subChecks.docsFetcher = { status: "OK", latency: Date.now() - docsStart, count: sections.length };
    } catch (e: any) {
        subChecks.docsFetcher = { status: "FAILURE", latency: Date.now() - docsStart, error: e.message };
    }

    // --- 2. MCP Server Protocol Compliance ---
    if (!env.MCP_API_URL) {
        subChecks.mcpProtocol = { status: "SKIPPED", reason: "MCP_API_URL missing" };
    } else {
        const mcpStart = Date.now();
        try {
            const rpcRequest = createMCPRequest("tools/list", {});
            const response = await fetch(env.MCP_API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "text/event-stream, application/json" },
                body: JSON.stringify(rpcRequest)
            });

            if (!response.ok) throw new Error(`MCP Server returned HTTP ${response.status}`);

            const contentType = response.headers.get("Content-Type") || "";
            if (contentType.includes("text/event-stream")) {
                subChecks.mcpProtocol = { status: "OK", latency: Date.now() - mcpStart, protocol: "sse", message: "Connection established (SSE)" };
            } else {
                const data = await response.json() as any;
                if (data.error) throw new Error(`MCP Error: ${data.error.message}`);
                if (!data.result?.tools) throw new Error("MCP Response invalid: missing 'result.tools'");
                const hasSearchTool = data.result.tools.some((t: any) => t.name === "search_cloudflare_documentation");
                subChecks.mcpProtocol = {
                    status: "OK",
                    latency: Date.now() - mcpStart,
                    protocol: "json-rpc",
                    toolsCount: data.result.tools.length,
                    hasSearchTool
                };
            }
        } catch (e: any) {
            subChecks.mcpProtocol = { status: "FAILURE", latency: Date.now() - mcpStart, error: e.message };
        }
    }

    // --- 3. Cloudflare MCP Tools (10 tools, real API calls, parallel) ---
    try {
        const cfReport = await runCloudflareHealthChecks(env);
        subChecks.cloudflareTools = {
            status: cfReport.overall === "healthy" ? "OK" : cfReport.overall === "degraded" ? "DEGRADED" : "FAILURE",
            overall: cfReport.overall,
            summary: cfReport.summary,
            tools: cfReport.tools
        };
    } catch (e: any) {
        subChecks.cloudflareTools = { status: "FAILURE", error: e.message };
    }

    // --- 4. GitHub MCP Tools (6 read-only API checks) ---
    try {
        const ghResult = await checkGitHubToolsHealth(env);
        subChecks.githubTools = {
            status: ghResult.status === "success" ? "OK" : "FAILURE",
            message: ghResult.message,
            details: ghResult.details,
            durationMs: ghResult.durationMs
        };
    } catch (e: any) {
        subChecks.githubTools = { status: "FAILURE", error: e.message };
    }

    // --- Determine Overall Status ---
    const hasFailure = Object.values(subChecks).some((c: any) => c.status === "FAILURE");
    const hasDegraded = Object.values(subChecks).some((c: any) => c.status === "DEGRADED");

    let overallStatus: "success" | "failure" = "success";
    let message = "MCP Services Operational";

    if (hasFailure) {
        overallStatus = "failure";
        const failing = Object.entries(subChecks)
            .filter(([, v]: any) => v.status === "FAILURE")
            .map(([k]) => k);
        message = `MCP degraded — failures in: ${failing.join(", ")}`;
    } else if (hasDegraded) {
        // Degraded means some tools are unhealthy but not critical
        message = "MCP Services Operational (some tools degraded)";
    }

    return {
        name: "MCP Domain",
        status: overallStatus,
        message,
        durationMs: Date.now() - start,
        details: subChecks
    };
}