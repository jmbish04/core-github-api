import { resolveCfEnv } from "@/cloudflare/env-resolver";
import { HealthResult } from '../types';



export async function checkHealth(env: Env): Promise<HealthResult> {
    const start = Date.now();
    const resolved = await resolveCfEnv(env).catch(() => null);
    const token = resolved?.CLOUDFLARE_OBSERVABILITY_TOKEN;
    if (!token) {
        return { tool: 'cloudflare-observability', status: 'unhealthy', error: 'Missing CLOUDFLARE_OBSERVABILITY_TOKEN', requiresAuth: true };
    }
    return { tool: 'cloudflare-observability', status: 'healthy', latencyMs: Date.now() - start, requiresAuth: true };
}
