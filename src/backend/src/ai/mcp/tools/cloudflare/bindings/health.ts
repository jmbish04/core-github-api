import { resolveCfEnv } from "@/cloudflare/env-resolver";
import { HealthResult } from '../types';

/**
 * Health check for the Cloudflare Bindings MCP tool.
 * Validates token presence and makes a real API call to list Workers for the account.
 */
export async function checkHealth(env: Env): Promise<HealthResult> {
    const start = Date.now();
    const resolved = await resolveCfEnv(env).catch(() => null);
    const token = resolved?.CLOUDFLARE_WORKER_ADMIN_TOKEN;
    const accountId = resolved?.CLOUDFLARE_ACCOUNT_ID;

    if (!token) {
        return { tool: 'cloudflare-bindings', status: 'unhealthy', error: 'Missing CLOUDFLARE_WORKER_ADMIN_TOKEN', requiresAuth: true };
    }

    try {
        // Real connectivity: list Workers scripts (confirms token has access to manage bindings)
        const res = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts?per_page=1`,
            { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
        );
        const latency = Date.now() - start;

        if (!res.ok) {
            const body = await res.text().catch(() => '');
            return { tool: 'cloudflare-bindings', status: 'unhealthy', latencyMs: latency, error: `API ${res.status}: ${body.slice(0, 200)}`, requiresAuth: true };
        }

        const data = await res.json() as { success: boolean; result: unknown[] };
        return {
            tool: 'cloudflare-bindings',
            status: 'healthy',
            latencyMs: latency,
            requiresAuth: true,
            details: { workersFound: Array.isArray(data.result) ? data.result.length : 0, apiSuccess: data.success }
        } as HealthResult;
    } catch (err) {
        return { tool: 'cloudflare-bindings', status: 'unhealthy', error: (err as Error).message, requiresAuth: true };
    }
}
