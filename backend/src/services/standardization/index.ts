
import { getOctokit } from "@services/octokit/core";
import { RepoAgent } from "@agents/github/Repo";
import { AgentGenerator } from "./agent-gen";
import { McpSync } from "./mcp-sync";
import { SecretSync } from "./secret-sync";

export class StandardizationService {
  /**
   * Main entry point to enforce standards on a repository.
   * Triggered by webhooks (push, pull_request, etc.)
   */
  static async enforce(env: Env, repository: any) {
    const owner = repository.owner.login;
    const repo = repository.name;
    
    console.log(`[Standardization] Enforcing standards for ${owner}/${repo}...`);

    try {
        // 1. Agent Generation
        // Check if agent exists, if not generate it.
        await AgentGenerator.ensureAgent(env, owner, repo);

        // 2. MCP Configuration Sync
        // Sync mcp.json from master repo
        await McpSync.syncMcpConfig(env, owner, repo);

        // 3. Secret Synchronization
        // Auto-provision default secrets if missing
        await SecretSync.autoProvisionSecrets(env, owner, repo);

        console.log(`[Standardization] Completed standards enforcement for ${owner}/${repo}`);
    } catch (error) {
        console.error(`[Standardization] Failed to enforce standards for ${owner}/${repo}:`, error);
        throw error;
    }
  }
}
