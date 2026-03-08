
import { HealthResult } from '../types';
import { resolveCfEnv } from "@/cloudflare/env-resolver";

export async function checkHealth(env: Env): Promise<HealthResult> {
    const start = Date.now();

    const resolved = await resolveCfEnv(env).catch(() => null);
    const token = resolved?.CLOUDFLARE_WORKER_ADMIN_TOKEN;
    const accountId = resolved?.CLOUDFLARE_ACCOUNT_ID;

    if (!token) {
        return {
            tool: 'cloudflare-builds',
            status: 'unhealthy',
            error: 'Missing CLOUDFLARE_WORKER_ADMIN_TOKEN',
            requiresAuth: true
        };
    }

    try {
        // Lightweight check: list builds (limit 1)
        const res = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/builds?per_page=1`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        const latency = Date.now() - start;
        return {
            tool: 'cloudflare-builds',
            status: res.ok ? 'healthy' : 'unhealthy',
            latencyMs: latency,
            error: res.ok ? undefined : `API returned ${res.status}`,
            requiresAuth: true
        };
    } catch (err) {
        return {
            tool: 'cloudflare-builds',
            status: 'unhealthy',
            error: (err as Error).message,
            requiresAuth: true
        };
    }
}
