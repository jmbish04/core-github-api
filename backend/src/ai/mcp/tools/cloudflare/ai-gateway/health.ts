
import { HealthResult } from '../types';
import { resolveCfEnv } from "@/cloudflare/env-resolver";

/**
 * Health check for the AI Gateway MCP tool.
 * Uses `resolveCfEnv` to unwrap SecretsStoreSecret bindings before verifying.
 */
export async function checkHealth(env: Env): Promise<HealthResult> {
    const start = Date.now();

    let resolved: Awaited<ReturnType<typeof resolveCfEnv>>;
    try {
        resolved = await resolveCfEnv(env);
    } catch (err) {
        return {
            tool: 'ai-gateway',
            status: 'unhealthy',
            error: `Failed to resolve env: ${(err as Error).message}`,
            requiresAuth: true
        };
    }

    const token = resolved.CLOUDFLARE_AI_GATEWAY_TOKEN;
    const accountId = resolved.CLOUDFLARE_ACCOUNT_ID;

    if (!token) {
        return {
            tool: 'ai-gateway',
            status: 'unhealthy',
            error: 'Missing CLOUDFLARE_AI_GATEWAY_TOKEN',
            requiresAuth: true
        };
    }

    try {
        // Lightweight verification: attempt to reach the AI Gateway list endpoint
        const res = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai-gateway/gateways?per_page=1`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        const latency = Date.now() - start;

        if (!res.ok) {
            return {
                tool: 'ai-gateway',
                status: 'unhealthy',
                latencyMs: latency,
                error: `API returned ${res.status}`,
                requiresAuth: true
            };
        }

        return {
            tool: 'ai-gateway',
            status: 'healthy',
            latencyMs: latency,
            requiresAuth: true
        };
    } catch (err) {
        return {
            tool: 'ai-gateway',
            status: 'unhealthy',
            error: (err as Error).message,
            requiresAuth: true
        };
    }
}
