import { configureRepoMcpTools } from "@services/github/mcp-config";
import { syncRepoSecrets } from "@services/github/secrets-manager";
import { getOctokit } from "@services/octokit/core";

export class OpsVerificationService {
    static async verifyMcpConfig(env: Env, owner: string, repo: string) {
        console.log(`[Ops] Verifying MCP configuration for ${owner}/${repo}...`);
        try {
            const result = await configureRepoMcpTools(env, owner, repo);
            return { success: true, result };
        } catch (error: any) {
            console.error('[Ops] MCP Verify failed:', error);
            return { success: false, error: error.message };
        }
    }

    static async verifySecretsSync(env: Env, owner: string, repo: string) {
        console.log(`[Ops] Verifying Secrets Manager for ${owner}/${repo}...`);
        
        // Check for GITHUB_TOKEN availability without exposing it
        if (!await env.GITHUB_TOKEN.get()) {
            return { success: false, error: "GITHUB_TOKEN not found in environment." };
        }

        try {
            // We use a safe check key
            const checkKey = "OPS_VERIFICATION_CHECK";
            const checkValue = `Verification run at ${new Date().toISOString()}`;
            
            const results = await syncRepoSecrets(env, owner, repo, [
                { name: checkKey, value: checkValue }
            ]);
            
            return { success: true, results };
        } catch (error: any) {
            console.error('[Ops] Secrets Verify failed:', error);
            return { success: false, error: error.message };
        }
    }
}
