import { HealthResult } from '../types';
import { resolveCfEnv } from "@/cloudflare/env-resolver";

/**
 * Health check for the Cloudflare Browser Rendering MCP tool.
 * Validates token presence and makes a real Browser Render API call to fetch a lightweight URL.
 */
export async function checkHealth(env: Env): Promise<HealthResult> {
    const start = Date.now();
    const resolved = await resolveCfEnv(env).catch(() => null);
    const token = resolved?.CLOUDFLARE_BROWSER_RENDER_TOKEN;
    const accountId = resolved?.CLOUDFLARE_ACCOUNT_ID;

    if (!token) {
        return {
            tool: 'browser-render',
            status: 'unhealthy',
            error: 'Missing CLOUDFLARE_BROWSER_RENDER_TOKEN',
            requiresAuth: true
        };
    }

    try {
        // Real connectivity: use the Browser Render API to fetch a lightweight health-check URL
        const res = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-render/content`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    url: 'https://cloudflare.com/favicon.ico',
                    options: { waitUntil: 'load' }
                })
            }
        );
        const latency = Date.now() - start;

        // 200 = rendered successfully; 400/422 = API reachable but input/params issue (still "healthy" auth)
        const reachable = res.ok || res.status === 400 || res.status === 422;
        if (!reachable) {
            const body = await res.text().catch(() => '');
            return { tool: 'browser-render', status: 'unhealthy', latencyMs: latency, error: `API ${res.status}: ${body.slice(0, 200)}`, requiresAuth: true };
        }

        return {
            tool: 'browser-render',
            status: 'healthy',
            latencyMs: latency,
            requiresAuth: true,
            details: { httpStatus: res.status }
        } as HealthResult;
    } catch (err) {
        return { tool: 'browser-render', status: 'unhealthy', error: (err as Error).message, requiresAuth: true };
    }
}
