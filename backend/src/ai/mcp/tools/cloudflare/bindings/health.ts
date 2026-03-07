import { resolveCfEnv } from "@/cloudflare/env-resolver";

export interface HealthResult {
    tool: string;
    status: 'healthy' | 'unhealthy' | 'skipped';
    latencyMs?: number;
    error?: string;
    requiresAuth?: boolean;
}

export async function checkHealth(env: Env): Promise<HealthResult> {
    const start = Date.now();
    const resolved = await resolveCfEnv(env).catch(() => null);
    const token = resolved?.CLOUDFLARE_WORKER_ADMIN_TOKEN;
    if (!token) {
        return { tool: 'cloudflare-bindings', status: 'unhealthy', error: 'Missing CLOUDFLARE_WORKER_ADMIN_TOKEN', requiresAuth: true };
    }
    return { tool: 'cloudflare-bindings', status: 'healthy', latencyMs: Date.now() - start, requiresAuth: true };
}
