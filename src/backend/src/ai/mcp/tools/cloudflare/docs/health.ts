import { HealthResult } from '../types';

/**
 * Health check for the Cloudflare Docs MCP tool.
 * Makes a real network fetch to the Cloudflare Developer Docs to verify connectivity.
 * No auth token required — this tool proxies public documentation.
 */
export async function checkHealth(_env: Env): Promise<HealthResult> {
    const start = Date.now();

    try {
        // Real connectivity: fetch the Cloudflare docs search endpoint
        const res = await fetch('https://developers.cloudflare.com/api/operations/cloudflare-i-ps-cloudflare-ip-details', {
            method: 'HEAD',
        });
        const latency = Date.now() - start;

        // HEAD returns 200 or 404 depending on the page — both indicate the host is up
        const reachable = res.status < 500;
        return {
            tool: 'cloudflare-docs',
            status: reachable ? 'healthy' : 'unhealthy',
            latencyMs: latency,
            requiresAuth: false,
            details: { httpStatus: res.status }
        } as HealthResult;
    } catch (err) {
        return {
            tool: 'cloudflare-docs',
            status: 'unhealthy',
            error: `Unable to reach developers.cloudflare.com: ${(err as Error).message}`,
            requiresAuth: false
        };
    }
}
