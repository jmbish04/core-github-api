import { resolveCfEnv } from "@/cloudflare/env-resolver";
import { HealthResult } from '../types';


export async function checkHealth(env: Env): Promise<HealthResult> {
    const start = Date.now();
    const resolved = await resolveCfEnv(env).catch(() => null);
    const token = resolved?.CLOUDFLARE_AI_SEARCH_TOKEN;
    if (!token) {
        return { tool: 'cloudflare-autorag', status: 'unhealthy', error: 'Missing CLOUDFLARE_AI_SEARCH_TOKEN', requiresAuth: true };
    }
    return { tool: 'cloudflare-autorag', status: 'healthy', latencyMs: Date.now() - start, requiresAuth: true };
}
