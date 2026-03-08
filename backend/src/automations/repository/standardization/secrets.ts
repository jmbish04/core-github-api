
import { syncRepoSecrets } from "@services/github/secrets-manager";

// Defines the list of default secret names we manage.
// In a real system, this might come from a DB or configuration file.
// For now, based on instructions:
// "Populate a dropdown with available keys from the Secret Store (filtering out already selected defaults)."
// And "Show a validation error on page load if a configured default secret name is missing from the Secret Store."

export class SecretSync {
    // These keys *MUST* exist in the worker-configuration.d.ts / Secrets Store to be valid candidates.
    // We hardcode the "Standard Default Set" here for now.
    private static DEFAULT_SECRET_NAMES = [
        "WORKER_API_KEY",
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "GEMINI_API_KEY",
        "GH_TOKEN", // Often needed for workflows
        "CLOUDFLARE_API_TOKEN"
    ];

    static async autoProvisionSecrets(env: Env, owner: string, repo: string, octokit?: any) {
        console.log(`[SecretSync] Auto-provisioning secrets for ${owner}/${repo}...`);

        const secretsToSync: { name: string; value: string }[] = [];

        for (const secretName of this.DEFAULT_SECRET_NAMES) {
            // Fetch from Env (Secret Store)
            const secretValue = await (env as any)[secretName]?.get?.() || (env as any)[secretName];
            
            if (!secretValue) {
                console.warn(`[SecretSync] Secret ${secretName} is configured as default but missing in Worker Env. Skipping.`);
                continue;
            }

            secretsToSync.push({ name: secretName, value: secretValue });
        }

        if (secretsToSync.length === 0) {
            console.log("[SecretSync] No valid secrets found to sync.");
            return;
        }

        try {
            await syncRepoSecrets(env, owner, repo, secretsToSync, octokit);
            console.log(`[SecretSync] Successfully synced ${secretsToSync.length} secrets.`);
        } catch (err) {
            console.error("[SecretSync] Failed to sync secrets:", err);
            // We don't throw here to avoid failing unrelated parts of the standardization flow
            // But we log heavily.
        }
    }
}
