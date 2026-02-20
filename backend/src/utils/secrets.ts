import { ConfigManager } from "@/lib/config";
import { isUuid } from "@/utils/common";
import { Logger } from "@/lib/logger";


/**
 * Generic helper to fetch a secret value.
 * 
 * Precedence:
 * 1. KV Config (Metadata/Pointer) -> Secret Store (Value)
 * 2. Secrets Store (Direct Binding fallback)
 * 3. Environment Variable (Legacy/Local)
 * 
 * CAUTION: This should ONLY be used for operations where the worker is retrieving a secret
 * from the secret-store in order to set the value inside of a GitHub repo, or other external provisioning.
 * 
 * For standard Worker operations (using the key itself), use `env.{SECRET_BINDING_NAME}.get()` directly.
 */
export async function getSecret(env: Env, key: string): Promise<string | undefined> {
    const logger = new Logger(env, 'utils/secrets');

    // 1. Try KV Config (Pointer Pattern)
    try {
        const manager = new ConfigManager(env.KV_CONFIGS);
        const metadata = await manager.getMetadata(key); 

        // CASE A: The key exists in KV and is managed by Secret Store
        if (metadata?.isSecretStoreManaged && metadata.secretName) {
            // We fetch the ACTUAL value from Cloudflare's Secret Store API
            try {
                 const { getSecretsStoreClient } = await import("@/utils/cloudflare/secret-store");
                 const client = await getSecretsStoreClient(env);
                 
                 // We need a store ID. We assume the first available store for now.
                 const store = await client.getDefaultStore();
                 
                 // If we have the ID in metadata.value, use it.
                 // Otherwise, try to find by name.
                 let secretId = String(metadata.value);
                 
                 // If value looks like a UUID, use it. If not (legacy or error), find by name.
                 if (!isUuid(secretId)) {
                     const found = await client.getSecretByName(store.id, metadata.secretName);
                     if (found) secretId = found.id;
                 }
                 
                 if (secretId) {
                    return await client.getSecretValue(store.id, secretId);
                 }
            } catch (apiError: any) {
                logger.warn(`[getSecret] Cloudflare Config Store API check failed for ${key}`, { error: apiError.message });
                // Fallthrough to fallback
            }
        }

        // CASE B: The key exists in KV as a plain string (Non-sensitive config)
        if (metadata?.value && !metadata.isSecretStoreManaged) {
            return String(metadata.value);
        }
        
    } catch (e: any) {
        // KV lookup failed or API failed
        // We log as warning because we have fallbacks
        logger.warn(`[getSecret] KV/API lookup failed for ${key}`, { error: e.message });
    }

    // 2. Fallback: Check Secrets Store or Env Var Binding (Legacy behavior compliance)
    const envVal = (env as any)[key];
    if (envVal && typeof envVal?.get === 'function') {
        const val = await envVal.get();
        // logger.debug(`[getSecret] Retrieved ${key} from direct binding`); // verbose
        return val;
    }
    
    // 3. Fallback: Direct property
    return envVal;
}

export async function getWorkerApiKey(env: Env): Promise<string | undefined> {
    if (env.WORKER_API_KEY) {
        return typeof env.WORKER_API_KEY === 'string' 
            ? env.WORKER_API_KEY 
            : await (env.WORKER_API_KEY as any).get();
    }
    return getSecret(env, "WORKER_API_KEY");
}

export async function getGithubToken(env: Env): Promise<string | undefined> {
    if (env.GITHUB_TOKEN) return env.GITHUB_TOKEN.get();
    return getSecret(env, "GITHUB_TOKEN");
}

export async function getOpenaiApiKey(env: Env): Promise<string | undefined> {
    if (env.OPENAI_API_KEY) return env.OPENAI_API_KEY.get();
    return getSecret(env, "OPENAI_API_KEY");
}

export async function getAnthropicApiKey(env: Env): Promise<string | undefined> {
    if (env.ANTHROPIC_API_KEY) return env.ANTHROPIC_API_KEY.get();
    return getSecret(env, "ANTHROPIC_API_KEY");
}

export async function getGeminiApiKey(env: Env): Promise<string | undefined> {
    if (env.GEMINI_API_KEY) return env.GEMINI_API_KEY.get();
    return getSecret(env, "GEMINI_API_KEY");
}

export async function getCloudflareApiToken(env: Env): Promise<string | undefined> {
    if (env.CLOUDFLARE_API_TOKEN) return env.CLOUDFLARE_API_TOKEN.get();
    return getSecret(env, "CLOUDFLARE_API_TOKEN");
}

export async function getCloudflareAccountId(env: Env): Promise<string | undefined> {
    if (env.CLOUDFLARE_ACCOUNT_ID) return env.CLOUDFLARE_ACCOUNT_ID.get();
    return getSecret(env, "CLOUDFLARE_ACCOUNT_ID");
}

export async function getGithubClientId(env: Env): Promise<string | undefined> {
    if (env.GITHUB_CLIENT_ID) return env.GITHUB_CLIENT_ID.get();
    return getSecret(env, "GITHUB_CLIENT_ID");
}

export async function getGithubClientSecret(env: Env): Promise<string | undefined> {
    if (env.GITHUB_CLIENT_SECRET) return env.GITHUB_CLIENT_SECRET.get();
    return getSecret(env, "GITHUB_CLIENT_SECRET");
}

/**
 * Helper to fetch the full GitHub App Private Key from split Base64 secrets.
 * @param env The worker environment bindings
 * @returns The reconstructed PEM private key string
 */
export async function getGitHubPrivateKey(env: Env): Promise<string> {
    // 1. Try Direct Bindings first (Preferred)
    let pt1, pt2, pt3;
    
    if (env.GITHUB_APP_PRIVATE_KEY_PT1) pt1 = await env.GITHUB_APP_PRIVATE_KEY_PT1.get();
    if (env.GITHUB_APP_PRIVATE_KEY_PT2) pt2 = await env.GITHUB_APP_PRIVATE_KEY_PT2.get();
    if (env.GITHUB_APP_PRIVATE_KEY_PT3) pt3 = await env.GITHUB_APP_PRIVATE_KEY_PT3.get();

    // 2. Fallback to getSecret (Managed/Pointer) if any part is missing
    if (!pt1) pt1 = await getSecret(env, "GITHUB_APP_PRIVATE_KEY_PT1");
    if (!pt2) pt2 = await getSecret(env, "GITHUB_APP_PRIVATE_KEY_PT2");
    if (!pt3) pt3 = await getSecret(env, "GITHUB_APP_PRIVATE_KEY_PT3");

    if (!pt1 || !pt2 || !pt3) {
        throw new Error("Missing GitHub Private Key parts in Secrets Store");
    }

    // 3. Concatenate the Base64 chunks and decode
    const fullB64 = pt1 + pt2 + pt3;

    try {
        return atob(fullB64);
    } catch (e) {
        throw new Error("Failed to decode GitHub Private Key. Ensure it was stored as valid Base64.");
    }
}

/**
 * Helper to fetch the GitHub App ID from secrets store.
 * @param env The worker environment bindings
 */
export async function getGitHubAppId(env: Env): Promise<string> {
    if (env.GITHUB_APP_ID) return env.GITHUB_APP_ID.get();
    
    const appId = await getSecret(env, "GITHUB_APP_ID");
    if (!appId) {
        throw new Error("Missing GITHUB_APP_ID in Secrets Store");
    }
    return appId;
}

/**
 * Helper to fetch the GitHub Webhook Secret.
 * Assuming this is also a Secrets Store binding.
 */
export async function getGitHubWebhookSecret(env: Env): Promise<string> {
    // This often maps to WORKER_API_KEY in this project
    if (env.WORKER_API_KEY) {
        const secret = typeof env.WORKER_API_KEY === 'string' 
            ? env.WORKER_API_KEY 
            : await (env.WORKER_API_KEY as any).get();
        if (secret) return secret;
    }

    const secret = await getSecret(env, "WORKER_API_KEY");
    if (!secret) {
        throw new Error("Missing WORKER_API_KEY in Secrets Store");
    }
    return secret;
}
