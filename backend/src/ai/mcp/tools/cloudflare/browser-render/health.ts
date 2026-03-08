import { HealthResult } from '../types';
import { resolveCfEnv } from "@/cloudflare/env-resolver";

export async function checkHealth(env: Env): Promise<HealthResult> {
    const start = Date.now();
    const resolved = await resolveCfEnv(env).catch(() => null);
    const token = resolved?.CLOUDFLARE_BROWSER_RENDER_TOKEN;
    if (!token) {
        return {
            tool: 'browser-render',
            status: 'unhealthy',
            error: 'CF_BROWSER_RENDER_TOKEN secret is missing or not resolved',
            requiresAuth: true
        };
    }
    return {
        tool: 'browser-render',
        status: 'healthy',
        latencyMs: Date.now() - start,
        requiresAuth: true
    };
}
