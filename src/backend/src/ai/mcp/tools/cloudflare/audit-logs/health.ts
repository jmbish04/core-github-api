import { HealthResult } from '../types';
import { resolveCfEnv } from "@/cloudflare/env-resolver";

/**
 * Health check for the Cloudflare Audit Logs MCP tool.
 * Validates token presence and makes a real API call to list recent audit logs.
 */
export async function checkHealth(env: Env): Promise<HealthResult> {
    const start = Date.now();
    const resolved = await resolveCfEnv(env).catch(() => null);
    const token = resolved?.CLOUDFLARE_OBSERVABILITY_TOKEN;
    const accountId = resolved?.CLOUDFLARE_ACCOUNT_ID;

    if (!token) {
        return { tool: 'audit-logs', status: 'unhealthy', error: 'Missing CLOUDFLARE_OBSERVABILITY_TOKEN', requiresAuth: true };
    }

    try {
        // Real connectivity: list audit logs (limit 1, last 1 hour)
        const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/audit_logs?per_page=1&since=${encodeURIComponent(since)}`;
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        const latency = Date.now() - start;

        if (!res.ok) {
            const body = await res.text().catch(() => '');
            return { tool: 'audit-logs', status: 'unhealthy', latencyMs: latency, error: `API ${res.status}: ${body.slice(0, 200)}`, requiresAuth: true };
        }

        const data = await res.json() as { success: boolean; result: unknown[] };
        return {
            tool: 'audit-logs',
            status: 'healthy',
            latencyMs: latency,
            requiresAuth: true,
            details: { logCount: Array.isArray(data.result) ? data.result.length : 0, apiSuccess: data.success }
        } as HealthResult;
    } catch (err) {
        return { tool: 'audit-logs', status: 'unhealthy', error: (err as Error).message, requiresAuth: true };
    }
}
