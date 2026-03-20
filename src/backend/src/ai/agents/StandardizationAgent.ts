import { z } from 'zod';
import { createAgent } from '@/ai/agents/honi';
import { buildMaxAgentMemory } from '@/ai/agents/memory';
import { AgentStateStore } from '@/ai/agents/support/state-store';
import { runAgentText } from '@/ai/agents/support/inference';
import type { AgentTool, PersistentAgentState } from '@/ai/agents/support/types';
import { makeQueryStandardsTool } from '@/ai/tools/standards';
import { buildSkillContext } from '@services/octokit/skill-fetcher';

const standardizationRuntime = createAgent<Env>({
  name: 'standardization-agent',
  model: 'claude-3-5-sonnet-latest',
  system: 'You analyze repository standards and produce actionable implementation prompts.',
  binding: 'STANDARDIZATION_AGENT',
  tools: [],
  memory: buildMaxAgentMemory({
    agentName: 'StandardizationAgent',
    graphId: 'core-github-api-standardization-agent',
  }),
  observability: { enabled: true, aiGatewaySlug: 'core-github-api', collectEvents: true },
});

const StandardizationDurableObject = standardizationRuntime.DurableObject as new (
  ctx: DurableObjectState,
  env: Env,
) => DurableObject & { env: Env };

export class StandardizationAgent extends StandardizationDurableObject {
  declare env: Env;
  private readonly store: AgentStateStore<PersistentAgentState>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.env = env;
    this.store = new AgentStateStore<PersistentAgentState>({
      ctx,
      env,
      agentName: 'StandardizationAgent',
      initialState: { status: 'idle', history: [] },
    });
  }

  async runAnalysis(prContext: string, issueNumber: number, owner: string, repo: string): Promise<string> {
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
      makeQueryStandardsTool(this.env as any) as AgentTool,
      {
        name: 'search_cloudflare_documentation',
        description: 'Search Cloudflare docs to ground best practices. Use only if Cloudflare platform specific questions arise.',
        parameters: z.object({ query: z.string() }),
        execute: async (args: Record<string, unknown>) => {
          const { queryMCP } = await import('@/ai/mcp/mcp-client');
          const result = await queryMCP(String(args.query || ''), 'StandardizationAgent');
          return typeof result === 'string' ? result : JSON.stringify(result);
        },
      },
    ];

    try {
      await this.store.setStatus('running');
      const skillContext = await buildSkillContext(this.env as any, 'StandardizationAgent');
      const result = await runAgentText({
        env: this.env,
        logger: this.store.logger,
        name: 'StandardizationAgent',
        instructions: `You are the primary Standardization orchestrator. Use tools strictly when necessary.${skillContext}`,
        prompt,
        tools,
      });
      await this.store.set({
        ...this.store.state,
        status: 'completed',
        lastResult: result,
        history: [...this.store.state.history, { issueNumber, owner, repo, result }],
      });
      return result;
    } catch (error) {
      this.store.logger.error(`StandardizationAgent failed for issue #${issueNumber}`, { error });
      await this.store.setStatus('failed');
      throw error;
    }
  }
}
