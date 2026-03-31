/**
 * Judge Agent (LLM-as-a-Judge)
 */
import { z } from 'zod';
import { createAgent } from '@/ai/agents/honi';
import { buildMaxAgentMemory } from '@/ai/agents/memory';
import { AgentStateStore } from '@/ai/agents/support/state-store';
import { runAgentStructured } from '@/ai/agents/support/inference';
import type { PersistentAgentState } from '@/ai/agents/support/types';
import { ResearchLogger } from '@research-logger';
import { getDb } from '@db';
import { resolveDefaultAiProvider, resolveDefaultAiModel } from '@/ai/providers/config';

const judgeRuntime = createAgent<Env>({
  name: 'judge-agent',
  model: 'claude-3-5-sonnet-latest',
  system: 'You are a precise evaluation agent.',
  binding: 'JUDGE_AGENT',
  tools: [],
  memory: buildMaxAgentMemory({
    agentName: 'JudgeAgent',
    graphId: 'core-github-api-judge',
  }),
  observability: { enabled: true, aiGatewaySlug: 'core-github-api', collectEvents: true },
});

const JudgeDurableObject = judgeRuntime.DurableObject as new (
  ctx: DurableObjectState,
  env: Env,
) => DurableObject & { env: Env };

const CandidateEvaluationSchema = z.object({
  score: z.number().min(0).max(100).describe('Score from 0 to 100'),
  reasoning: z.string().describe('Explanation for the score'),
  relevant: z.boolean().describe('Whether the content is relevant to the criteria'),
});

export class JudgeAgent extends JudgeDurableObject {
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
      agentName: 'JudgeAgent',
      initialState: { status: 'idle', history: [] },
    });
  }

  async evaluateCandidate(briefId: string, candidate: { url: string; content?: string }, criteria: string) {
    const db = getDb(this.env.DB);
    const researchLogger = new ResearchLogger(db, briefId, null, 'JudgeAgent', this.doState);

    await this.store.setStatus('running');
    await researchLogger.logInfo('Evaluation', `Judging candidate: ${candidate.url}`);

    let result = { score: 0, reasoning: 'Evaluation failed', relevant: false };
    try {
      result = await runAgentStructured({
        env: this.env,
        logger: this.store.logger,
        name: 'ResearchJudge',
        instructions: 'You are a critical research judge. Evaluate the following content against the research criteria.',
        prompt: `Criteria: ${criteria}\n\nCandidate Content: ${candidate.content?.substring(0, 5000)}...`,
        schema: CandidateEvaluationSchema,
        provider: resolveDefaultAiProvider(this.env),
        model: resolveDefaultAiModel(this.env, resolveDefaultAiProvider(this.env)),
      });
    } catch (error) {
      await researchLogger.logError('Evaluation', error, { raw: 'Structured output failed' });
    }

    await researchLogger.logThought('Evaluation', `Score: ${result.score}. Reasoning: ${result.reasoning}`);
    await this.store.appendHistory({ briefId, candidateUrl: candidate.url, criteria, result });
    await this.store.set({ ...this.store.state, status: 'completed', lastResult: result });

    return result;
  }
}
