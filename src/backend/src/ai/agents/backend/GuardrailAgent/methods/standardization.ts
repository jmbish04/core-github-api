/**
 * @file GuardrailAgent/methods/standardization.ts
 * @description Absorbed from StandardizationAgent.ts — PR-level codebase
 *              standardization analysis using MCP tools and AI-driven prompt generation.
 *              Pure functions with DI.
 */
import { z } from "zod";
import type {
  AIProvider,
  AgentStateStore,
  PersistentAgentState,
  AgentTool,
} from '@/ai/providers';
import { makeQueryStandardsTool } from "@/ai/mcp/tools/standards";

// ── Types ──────────────────────────────────────────────────────────────
type StandardizationDeps = {
  ai: AIProvider;
  store: AgentStateStore<PersistentAgentState>;
  env: Env;
  agent?: any;
};

// ── Methods ────────────────────────────────────────────────────────────

/**
 * Analyze a PR context and generate a standardization prompt for a coding agent.
 * Absorbed from StandardizationAgent.runAnalysis().
 */
export async function runStandardizationAnalysis(
  deps: StandardizationDeps,
  prContext: string,
  issueNumber: number,
  owner: string,
  repo: string,
): Promise<string> {
  const prompt = `You are a strict codebase standardization expert.
Analyze the following Pull Request / Issue Context:
---
${prContext}
---
Decide which standards apply to the changes in this PR.
Query the active repository standards and retrieve their descriptions to ensure absolute correctness.
Formulate a highly specific implementation prompt for an AI coding assistant that will explicitly instruct it on how to fix the discrepancies in this PR.

Your response should ONLY be the final prompt that will be fed to the coding agent.`;

  const tools: AgentTool[] = [
    makeQueryStandardsTool(deps.env as any) as unknown as AgentTool,
    {
      name: "search_cloudflare_documentation",
      description:
        "Search Cloudflare docs to ground best practices. Use only if Cloudflare platform specific questions arise.",
      parameters: z.object({ query: z.string() }),
      execute: async (args: Record<string, unknown>) => {
        if (!deps.agent) throw new Error("Agent instance required for RPC");
        const cloudflareAgent = deps.agent.getPeerAgent((deps.env as any).CLOUDFLARE_AGENT);
        const result = await cloudflareAgent.agenticSearch(String(args.query || ""));
        return result?.docsContext ?? JSON.stringify(result);
      },
    },
  ];

  try {
    await deps.store.setStatus("running");
    const result = await deps.ai.generateText(
      prompt,
      `You are the primary Standardization orchestrator. Use tools strictly when necessary.` +
        deps.ai.buildToolInstructions(tools),
      { skills: ['clean-code', 'cloudflare'] },
    );
    await deps.store.set({
      ...deps.store.state,
      status: "completed",
      lastResult: result,
      history: [...deps.store.state.history, { issueNumber, owner, repo, result }],
    });
    return result;
  } catch (error) {
    deps.store.logger.error(`StandardizationAgent failed for issue #${issueNumber}`, { error });
    await deps.store.setStatus("failed");
    throw error;
  }
}
