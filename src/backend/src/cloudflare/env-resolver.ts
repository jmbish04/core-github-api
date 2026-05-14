/**
 * @file backend/src/cloudflare/env-resolver.ts
 * @description Resolves Cloudflare Secrets Store bindings (SecretsStoreSecret → string).
 *
 * Env bindings from wrangler.jsonc Secrets Store have `SecretsStoreSecret` type
 * and must be awaited with `.get()`. This module centralises that logic so that
 * all downstream cloudflare services work with plain strings.
 *
 * Binding name → secret name mapping (from wrangler.jsonc):
 *   AI_GATEWAY_TOKEN              → CLOUDFLARE_AI_GATEWAY_TOKEN
 *   CF_BROWSER_RENDER_TOKEN       → CLOUDFLARE_BROWSER_RENDER_TOKEN
 *   CLOUDFLARE_ACCOUNT_ID         → CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_WRANGLER_API_TOKEN          → CLOUDFLARE_WRANGLER_API_TOKEN
 *   CLOUDFLARE_WORKER_ADMIN_TOKEN → CLOUDFLARE_WORKER_ADMIN_TOKEN
 *   CLOUDFLARE_OBSERVABILITY_TOKEN→ CLOUDFLARE_OBSERVABILITY_TOKEN
 *   CLOUDFLARE_AI_SEARCH_TOKEN    → CLOUDFLARE_AI_SEARCH_TOKEN
 */

import { getSecret } from '@/utils/secrets';

export interface ResolvedCloudflareEnv {
    CLOUDFLARE_ACCOUNT_ID: string;
    CLOUDFLARE_AI_GATEWAY_TOKEN: string;
    CLOUDFLARE_BROWSER_RENDER_TOKEN: string;
    CLOUDFLARE_WORKER_ADMIN_TOKEN: string;
    CLOUDFLARE_OBSERVABILITY_TOKEN: string;
    CLOUDFLARE_AI_SEARCH_TOKEN: string;
    CLOUDFLARE_WRANGLER_API_TOKEN: string;
    CLOUDFLARE_ACCOUNT_TOKEN_ADMIN_TOKEN: string;
    CLOUDFLARE_USER_TOKEN_ADMIN: string;
    CLOUDFLARE_ZONE_DNS_ROUTES_TOKEN: string;
    CLOUDFLARE_D1_KV_TOKEN: string;
}

/**
 * Resolves all Cloudflare-related secrets from the Worker Env, returning a
 * plain-string record that can be passed to `getCloudflareConfig()`.
 *
 * Handles both SecretsStoreSecret bindings (need `.get()`) and plain string env vars.
 */
export async function resolveCfEnv(env: Env): Promise<ResolvedCloudflareEnv> {
    const resolve = async (key: string, fallback = ''): Promise<string> => {
        const secret = await getSecret(env, key);
        return secret || fallback;
    };

    const [
        accountId,
        aiGatewayToken,
        browserRenderToken,
        workerAdminToken,
        observabilityToken,
        aiSearchToken,
        apiToken,
    ] = await Promise.all([
        resolve('CLOUDFLARE_ACCOUNT_ID'),
        resolve('AI_GATEWAY_TOKEN'),
        resolve('CF_BROWSER_RENDER_TOKEN'),
        resolve('CLOUDFLARE_WORKER_ADMIN_TOKEN'),
        resolve('CLOUDFLARE_OBSERVABILITY_TOKEN'),
        resolve('CLOUDFLARE_AI_SEARCH_TOKEN'),
        resolve('CLOUDFLARE_WRANGLER_API_TOKEN'),
    ]);

    return {
        CLOUDFLARE_ACCOUNT_ID: accountId,
        CLOUDFLARE_AI_GATEWAY_TOKEN: aiGatewayToken,
        CLOUDFLARE_BROWSER_RENDER_TOKEN: browserRenderToken,
        CLOUDFLARE_WORKER_ADMIN_TOKEN: workerAdminToken,
        CLOUDFLARE_OBSERVABILITY_TOKEN: observabilityToken,
        CLOUDFLARE_AI_SEARCH_TOKEN: aiSearchToken,
        CLOUDFLARE_WRANGLER_API_TOKEN: apiToken,
        // These share the same admin token in most setups
        CLOUDFLARE_ACCOUNT_TOKEN_ADMIN_TOKEN: apiToken,
        CLOUDFLARE_USER_TOKEN_ADMIN: apiToken,
        CLOUDFLARE_ZONE_DNS_ROUTES_TOKEN: apiToken,
        CLOUDFLARE_D1_KV_TOKEN: workerAdminToken,
    };
}
