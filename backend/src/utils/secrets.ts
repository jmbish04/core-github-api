/**
 * Helper to fetch the full GitHub App Private Key from split Base64 secrets.
 * @param env The worker environment bindings
 * @returns The reconstructed PEM private key string
 */
export async function getGitHubPrivateKey(env: Env): Promise<string> {
    const pt1 = await env.GITHUB_APP_PRIVATE_KEY_PT1.get();
    const pt2 = await env.GITHUB_APP_PRIVATE_KEY_PT2.get();
    const pt3 = await env.GITHUB_APP_PRIVATE_KEY_PT3.get();

    if (!pt1 || !pt2 || !pt3) {
        throw new Error("Missing GitHub Private Key parts in Secrets Store");
    }

    // 1. Concatenate the Base64 chunks
    const fullB64 = pt1 + pt2 + pt3;

    // 2. Decode Base64 back to the original PEM RSA format
    // Cloudflare Workers provides atob() globally.
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
    // Note: Secrets Store .get() returns a Promise<string>
    const appId = await env.GITHUB_APP_ID.get();
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
    const secret = await env.WORKER_API_KEY.get();
    if (!secret) {
        throw new Error("Missing WORKER_API_KEY in Secrets Store");
    }
    return secret;
}
