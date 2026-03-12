export interface McpServerDefinition {
  type: 'stdio' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  tools?: string[];
}

export interface CanonicalMcpConfig {
  mcpServers: Record<string, McpServerDefinition>;
}

export interface CopilotMcpPayload {
  mcp_config: CanonicalMcpConfig;
  agent_firewall_enabled: boolean;
  recommended_allowlist_enabled: boolean;
}

export function buildCanonicalMcpConfig(): CanonicalMcpConfig {
  return {
    mcpServers: {
      'cloudflare-docs': {
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'mcp-remote', 'https://docs.mcp.cloudflare.com/mcp'],
        tools: ['search_cloudflare_documentation'],
      },
      stitch: {
        type: 'http',
        url: 'https://stitch.googleapis.com/mcp',
        headers: {
          Accept: 'application/json',
          'X-Goog-Api-Key': '${STITCH_API_KEY}',
        },
        tools: [
          'create_project',
          'list_projects',
          'list_screens',
          'get_project',
          'get_screen',
          'generate_screen_from_text',
        ],
      },
    },
  };
}

export function buildRootMcpJson(): string {
  return `${JSON.stringify(buildCanonicalMcpConfig(), null, 2)}\n`;
}

export function buildCopilotMcpJson(): string {
  return `${JSON.stringify(buildCanonicalMcpConfig(), null, 2)}\n`;
}

export function buildCopilotMcpPayload(): CopilotMcpPayload {
  return {
    mcp_config: buildCanonicalMcpConfig(),
    agent_firewall_enabled: true,
    recommended_allowlist_enabled: true,
  };
}
