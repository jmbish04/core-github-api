/**
 * @file src/services/github/mcp-config.ts
 * @description Service to configure MCP tools on GitHub repositories.
 * @owner AI-Builder
 */

import { getOctokit } from '@services/octokit/core'

/**
 * Configuration payload for the GitHub Copilot Coding Agent MCP settings.
 * Based on the structure provided in the user request.
 */
interface McpConfigPayload {
  mcp_config: {
    mcpServers: Record<string, {
      type: string;
      command: string;
      args: string[];
      tools?: string[];
    }>;
  };
  agent_firewall_enabled?: boolean;
  recommended_allowlist_enabled?: boolean;
}

/**
 * Configures MCP tools for a repository's Copilot Coding Agent.
 * Specifically sets up the 'cloudflare-docs' MCP server.
 * 
 * @param env The Cloudflare Worker environment bindings
 * @param owner The repository owner (user or organization)
 * @param repo The repository name
 * @returns The response data from the GitHub API
 */
export async function configureRepoMcpTools(env: Env, owner: string, repo: string) {
  try {
    const octokit = await getOctokit(env);

    // Define the configuration payload
    const payload: McpConfigPayload = {
      mcp_config: {
        mcpServers: {
          "cloudflare-docs": {
            type: "stdio",
            command: "npx",
            args: [
              "-y",
              "mcp-remote",
              "https://docs.mcp.cloudflare.com/mcp"
            ],
            tools: [
              "search_cloudflare_documentation"
            ]
          }
        }
      },
      agent_firewall_enabled: true,
      recommended_allowlist_enabled: true
    };

    console.log(`[MCP-Config] Configuring tools for ${owner}/${repo}...`);

    // Use the generic request method since this is a beta/preview endpoint
    // compatible with standard octokit usage
    const response = await octokit.request('PATCH /repos/{owner}/{repo}/copilot/coding_agent', {
      owner,
      repo,
      ...payload
    });

    console.log(`[MCP-Config] Success: ${response.status}`);
    return response.data;

  } catch (error: any) {
    console.error(`[MCP-Config] Error configuring tools for ${owner}/${repo}:`, error);
    // Rethrow or return null depending on desired failure handling. 
    // Rethrowing allows the caller to handle the error.
    throw error;
  }
}
