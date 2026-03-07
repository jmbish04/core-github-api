import { HealthResult } from '../types';
import { resolveCfEnv } from "@/cloudflare/env-resolver";

/**
 * Health check for the Sandbox MCP tool.
 * The SANDBOX Durable Object binding is required and will report unhealthy if missing.
 */
export async function checkHealth(env: Env): Promise<HealthResult> {
    const start = Date.now();
    if (!env.SANDBOX) {
        return {
            tool: 'sandbox',
            status: 'unhealthy',
            error: 'SANDBOX Durable Object binding is not configured in wrangler.jsonc',
            requiresAuth: false
        };
    }
    return {
        tool: 'sandbox',
        status: 'healthy',
        latencyMs: Date.now() - start,
        requiresAuth: false
    };
}
