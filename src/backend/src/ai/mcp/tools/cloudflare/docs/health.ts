import { resolveCfEnv } from "@/cloudflare/env-resolver";
import { HealthResult } from '../types';

export async function checkHealth(env: Env): Promise<HealthResult> {
    return { tool: 'cloudflare-docs', status: 'healthy', requiresAuth: false };
}
