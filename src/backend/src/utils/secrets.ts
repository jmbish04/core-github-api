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

/**
 * Helper to fetch the AGENTIC_WORKER_API_KEY from the Secrets Store.
 * This key is exclusively for agent/automation access to the frontend.
 * It supports the ?AGENT_AUTH= URL query param auth path, which is NOT
 * available to the regular WORKER_API_KEY.
 */
export async function getAgenticWorkerApiKey(env: Env): Promise<string | undefined> {
    if (env.AGENTIC_WORKER_API_KEY) {
        return typeof env.AGENTIC_WORKER_API_KEY === 'string'
            ? env.AGENTIC_WORKER_API_KEY
            : await env.AGENTIC_WORKER_API_KEY.get();
    }
    return getSecret(env, "AGENTIC_WORKER_API_KEY");
}

export async function getGithubToken(env: Env): Promise<string | undefined> {
    if (env.GITHUB_PERSONAL_ACCESS_TOKEN) {
        return typeof env.GITHUB_PERSONAL_ACCESS_TOKEN === 'string'
            ? env.GITHUB_PERSONAL_ACCESS_TOKEN
            : await (env.GITHUB_PERSONAL_ACCESS_TOKEN as any).get();
    }
    return getSecret(env, "GITHUB_PERSONAL_ACCESS_TOKEN");
}

export async function getOpenaiApiKey(env: Env): Promise<string | undefined> {
    if (env.OPENAI_API_KEY) {
        return typeof env.OPENAI_API_KEY === 'string'
            ? env.OPENAI_API_KEY
            : await (env.OPENAI_API_KEY as any).get();
    }
    return getSecret(env, "OPENAI_API_KEY");
}

export async function getAnthropicApiKey(env: Env): Promise<string | undefined> {
    if (env.ANTHROPIC_API_KEY) {
        return typeof env.ANTHROPIC_API_KEY === 'string'
            ? env.ANTHROPIC_API_KEY
            : await (env.ANTHROPIC_API_KEY as any).get();
    }
    return getSecret(env, "ANTHROPIC_API_KEY");
}

export async function getGeminiApiKey(env: Env): Promise<string | undefined> {
    if (env.GEMINI_API_KEY) {
        return typeof env.GEMINI_API_KEY === 'string'
            ? env.GEMINI_API_KEY
            : await (env.GEMINI_API_KEY as any).get();
    }
    return getSecret(env, "GEMINI_API_KEY");
}

export async function getCloudflareApiToken(env: Env): Promise<string | undefined> {
    if (env.CLOUDFLARE_API_TOKEN) {
        return typeof env.CLOUDFLARE_API_TOKEN === 'string'
            ? env.CLOUDFLARE_API_TOKEN
            : await (env.CLOUDFLARE_API_TOKEN as any).get();
    }
    return getSecret(env, "CLOUDFLARE_API_TOKEN");
}

export async function getCloudflareAccountId(env: Env): Promise<string | undefined> {
    if (env.CLOUDFLARE_ACCOUNT_ID) {
        return typeof env.CLOUDFLARE_ACCOUNT_ID === 'string'
            ? env.CLOUDFLARE_ACCOUNT_ID
            : await (env.CLOUDFLARE_ACCOUNT_ID as any).get();
    }
    return getSecret(env, "CLOUDFLARE_ACCOUNT_ID");
}

export async function getGithubClientId(env: Env): Promise<string | undefined> {
    if (env.GITHUB_CLIENT_ID) {
        return typeof env.GITHUB_CLIENT_ID === 'string'
            ? env.GITHUB_CLIENT_ID
            : await (env.GITHUB_CLIENT_ID as any).get();
    }
    return getSecret(env, "GITHUB_CLIENT_ID");
}

export async function getGithubClientSecret(env: Env): Promise<string | undefined> {
    if (env.GITHUB_CLIENT_SECRET) {
        return typeof env.GITHUB_CLIENT_SECRET === 'string'
            ? env.GITHUB_CLIENT_SECRET
            : await (env.GITHUB_CLIENT_SECRET as any).get();
    }
    return getSecret(env, "GITHUB_CLIENT_SECRET");
}

/**
 * Helper to fetch the full GitHub App Private Key.
 * Automatically converts PKCS#1 (BEGIN RSA PRIVATE KEY) → PKCS#8 (BEGIN PRIVATE KEY)
 */
export async function getGitHubPrivateKey(env: Env): Promise<string> {
    let rawKey = "";

    try {
        const pt1 = await (env as any).CORE_GITHUB_API_GITHUB_APP_PRIVATE_KEY_PT1?.get() || "";
        const pt2 = await (env as any).CORE_GITHUB_API_GITHUB_APP_PRIVATE_KEY_PT2?.get() || "";
        const pt3 = await (env as any).CORE_GITHUB_API_GITHUB_APP_PRIVATE_KEY_PT3?.get() || "";
        
        let combined = String(pt1) + String(pt2) + String(pt3);

        if (combined && !combined.includes("-----BEGIN")) {
            try {
                combined = atob(combined);
            } catch (_e) {
                console.warn("Failed to decode GitHub App Private Key parts, checking fallback...", JSON.stringify(_e));
                // If it fails to decode, we keep the original string
            }
        }
        
        rawKey = combined;
    } catch (e) {
        console.warn("Failed to fetch split GitHub App Private Key parts, checking fallback...", e);
    }
        
    // Fallback for local testing or if the old key is still around
    if (!rawKey && (env as any).GITHUB_APP_PRIVATE_KEY) {
        rawKey = typeof (env as any).GITHUB_APP_PRIVATE_KEY === 'string'
            ? (env as any).GITHUB_APP_PRIVATE_KEY
            : await (env as any).GITHUB_APP_PRIVATE_KEY.get();
    }

    if (!rawKey) {
        throw new Error("Missing CORE_GITHUB_API_GITHUB_APP_PRIVATE_KEY or parts in Environment/Secrets Store");
    }

    // Handle literal \n characters if present in env var (common in Cloudflare Secrets)
    let normalizedRawKey = rawKey;
    if (normalizedRawKey.includes("\\n")) {
        normalizedRawKey = normalizedRawKey.replace(/\\n/g, "\n");
    }
    
    // If it's already PKCS#8, return as-is
    if (normalizedRawKey.includes('BEGIN PRIVATE KEY') && !normalizedRawKey.includes('BEGIN RSA PRIVATE KEY')) {
        return normalizedRawKey;
    }

    try {
        const base64Match = normalizedRawKey.match(/-----BEGIN RSA PRIVATE KEY-----([\s\S]*?)(-----END|$)/);
        if (!base64Match) {
            return normalizedRawKey;
        }
        
        // Clean up the body to pure base64
        const pemBody = base64Match[1].replace(/\s/g, '');
        const derBuffer = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
        
        // Wrap the PKCS#1 inner bytes into a PKCS#8 envelope without using crypto.subtle.exportKey
        const pkcs8Der = wrapPkcs1InPkcs8(derBuffer);
        const pkcs8Base64 = btoa(String.fromCharCode(...new Uint8Array(pkcs8Der)));
        const pkcs8Pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8Base64.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`;
        
        return pkcs8Pem;
    } catch (e) {
        console.error("PKCS1 Reconstruction/Wrapping Failed:", e);
        return normalizedRawKey;
    }
}

/**
 * Wraps a raw PKCS#1 RSAPrivateKey DER byte array into a PKCS#8 PrivateKeyInfo DER envelope.
 */
function wrapPkcs1InPkcs8(pkcs1Der: Uint8Array): ArrayBuffer {
    const version = new Uint8Array([0x02, 0x01, 0x00]);
    const rsaOidBytes = new Uint8Array([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);
    const algorithmIdentifier = encodeSequence(rsaOidBytes);
    const privateKeyOctet = encodeTag(0x04, pkcs1Der);
    const privateKeyInfo = encodeSequence(concatBytes(version, algorithmIdentifier, privateKeyOctet));
    return privateKeyInfo.buffer.slice(privateKeyInfo.byteOffset, privateKeyInfo.byteOffset + privateKeyInfo.byteLength) as ArrayBuffer;
}

function encodeLength(len: number): Uint8Array {
    if (len < 128) return new Uint8Array([len]);
    if (len < 256) return new Uint8Array([0x81, len]);
    return new Uint8Array([0x82, (len >> 8) & 0xff, len & 0xff]);
}

function encodeTag(tag: number, data: Uint8Array): Uint8Array {
    return concatBytes(new Uint8Array([tag]), encodeLength(data.length), data);
}

function encodeSequence(data: Uint8Array): Uint8Array {
    return encodeTag(0x30, data);
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
    const total = arrays.reduce((n, a) => n + a.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const arr of arrays) { out.set(arr, offset); offset += arr.length; }
    return out;
}

/**
 * Helper to fetch the GitHub App ID from secrets store.
 * @param env The worker environment bindings
 */
export async function getGitHubAppId(env: Env): Promise<string> {
    if (env.GITHUB_APP_ID) {
        return typeof env.GITHUB_APP_ID === 'string'
            ? env.GITHUB_APP_ID
            : await (env.GITHUB_APP_ID as any).get();
    }
    
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
