import { resolveCfEnv } from "@/cloudflare/env-resolver";
import { HealthResult } from '../types';

/**
 * Health check for the Cloudflare Workers Observability MCP tool.
 * Validates token presence and makes a real API call to the Workers Observability endpoint.
 */
export async function checkHealth(env: Env): Promise<HealthResult> {
    const start = Date.now();
    const resolved = await resolveCfEnv(env).catch(() => null);
    const token = resolved?.CLOUDFLARE_OBSERVABILITY_TOKEN;
    const accountId = resolved?.CLOUDFLARE_ACCOUNT_ID;

    if (!token) {
        return { tool: 'cloudflare-observability', status: 'unhealthy', error: 'Missing CLOUDFLARE_OBSERVABILITY_TOKEN', requiresAuth: true };
    }

    try {
        // Real connectivity: query Workers Observability telemetry keys endpoint
        const res = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/observability/telemetry/keys?limit=1`,
            { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
        );
        const latency = Date.now() - start;

        if (!res.ok) {
            const body = await res.text().catch(() => '');
            return { tool: 'cloudflare-observability', status: 'unhealthy', latencyMs: latency, error: `API ${res.status}: ${body.slice(0, 200)}`, requiresAuth: true };
        }

        return {
            tool: 'cloudflare-observability',
            status: 'healthy',
            latencyMs: latency,
            requiresAuth: true,
            details: { endpoint: 'workers/observability/telemetry/keys' }
        } as HealthResult;
    } catch (err) {
        return { tool: 'cloudflare-observability', status: 'unhealthy', error: (err as Error).message, requiresAuth: true };
    }
}
