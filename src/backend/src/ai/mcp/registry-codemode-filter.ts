/**
 * @file ai/mcp/registry-codemode-filter.ts
 * @description Fail-closed codemode tool filter for the MCP tool registry.
 *
 * Filters the MCP_TOOLS registry to produce a strictly safe subset
 * for codemode execution. Tools that write to GitHub, mutate Cloudflare
 * resources, or require human approval are REJECTED (fail-closed).
 *
 * @see V8-09 in TASKS.json
 */

import type { MCPTool } from './tools';

// ─── Extended Safety Metadata ────────────────────────────────────────────────

/**
 * Extended MCP tool definition with codemode safety annotations.
 * These fields are optional on the base MCPTool interface but
 * required for codemode filtering decisions.
 */
export interface MCPToolWithSafety extends MCPTool {
  /** If true, the tool requires human approval before execution. */
  needsApproval?: boolean;
  /** If true, the tool writes to GitHub (commits, PRs, file mutations). */
  writesToGitHub?: boolean;
  /** If true, the tool mutates Cloudflare infrastructure (D1, KV, R2, DNS). */
  mutatesCloudflare?: boolean;
}

/**
 * Derive whether a tool is safe for codemode execution.
 * A tool is safe IFF it does NOT require approval, does NOT write to GitHub,
 * and does NOT mutate Cloudflare resources.
 */
export function isSafeForCodemode(tool: MCPToolWithSafety): boolean {
  return !tool.needsApproval && !tool.writesToGitHub && !tool.mutatesCloudflare;
}

/**
 * Filter tools for codemode execution.
 *
 * FAIL-CLOSED: If any tool in the input set has a dangerous flag set,
 * an error is thrown rather than silently filtering it out. This forces
 * callers to explicitly curate their tool sets.
 *
 * @param tools - Array of MCPToolWithSafety entries
 * @returns Filtered array containing only safe tools
 * @throws Error if any tool has needsApproval, writesToGitHub, or mutatesCloudflare
 */
export function filterToolsForCodemode(tools: MCPToolWithSafety[]): MCPToolWithSafety[] {
  const unsafe: string[] = [];

  for (const tool of tools) {
    if (tool.needsApproval || tool.writesToGitHub || tool.mutatesCloudflare) {
      const flags = [
        tool.needsApproval && 'needsApproval',
        tool.writesToGitHub && 'writesToGitHub',
        tool.mutatesCloudflare && 'mutatesCloudflare',
      ].filter(Boolean).join(', ');
      unsafe.push(`${tool.name} (${flags})`);
    }
  }

  if (unsafe.length > 0) {
    throw new Error(
      `[filterToolsForCodemode] FAIL-CLOSED: ${unsafe.length} tool(s) have dangerous flags ` +
      `and cannot be passed to codemode: ${unsafe.join('; ')}`
    );
  }

  // All tools passed validation — return them all
  return tools.filter(t => isSafeForCodemode(t));
}
