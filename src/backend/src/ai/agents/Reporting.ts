import { createAgent } from '@/ai/agents/honi';
import { buildMaxAgentMemory } from '@/ai/agents/memory';
import { AgentStateStore } from '@/ai/agents/support/state-store';
import { runAgentText } from '@/ai/agents/support/inference';
import type { PersistentAgentState } from '@/ai/agents/support/types';
import { ResearchLogger } from '@research-logger';
import { getDb } from '@db';
import { buildSkillContext } from '@services/octokit/skill-fetcher';

const reportingRuntime = createAgent<Env>({
  name: 'reporting-agent',
  model: 'claude-3-5-sonnet-latest',
  system: 'You synthesize research findings into rigorous markdown reports.',
  binding: 'REPORTING_AGENT',
  tools: [],
  memory: buildMaxAgentMemory({
    agentName: 'ReportingAgent',
    graphId: 'core-github-api-reporting',
  }),
  observability: { enabled: true, aiGatewaySlug: 'core-github-api', collectEvents: true },
});

const ReportingDurableObject = reportingRuntime.DurableObject as new (
  ctx: DurableObjectState,
  env: Env,
) => DurableObject & { env: Env };

export class ReportingAgent extends ReportingDurableObject {
  declare env: Env;
  private readonly store: AgentStateStore<PersistentAgentState>;
  private readonly doState: DurableObjectState;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.env = env;
    this.doState = state;
    this.store = new AgentStateStore<PersistentAgentState>({
      ctx: state,
      env,
      agentName: 'ReportingAgent',
      initialState: { status: 'idle', history: [] },
    });
  }

  async generateReport(briefId: string, candidates: any[], plan: any) {
    const db = getDb(this.env.DB);
    const researchLogger = new ResearchLogger(db, briefId, null, 'ReportingAgent', this.doState);

    await this.store.setStatus('running');
    await researchLogger.logInfo('Reporting', `Synthesizing report from ${candidates.length} sources...`);

    const sourcesText = candidates
      .map((candidate, index) => `Source [${index + 1}] (${candidate.sourceUrl}): ${candidate.initialSummary}`)
      .join('\n\n');
    const prompt = `Research Goal: ${JSON.stringify(plan)}\n\nVerified Sources:\n${sourcesText}\n\nGenerate a comprehensive markdown report. Cite sources using [Source URL] notation.`;

    const report = await runAgentText({
      env: this.env,
      logger: this.store.logger,
      name: 'ResearchReporter',
      instructions: `You remain objective and thorough. Synthesize the provided sources into a cohesive report.
Use standard Markdown. Include a "Key Findings", "Detailed Analysis", and "References" section.${await buildSkillContext(this.env as any, 'ReportingAgent')}`,
      prompt,
    });

    await researchLogger.logToolOutput('ReportGeneration', 'Report generated successfully.');
    await this.store.appendHistory({ briefId, candidateCount: candidates.length, report });
    await this.store.set({ ...this.store.state, status: 'completed', lastResult: report });

    return report;
  }
}
