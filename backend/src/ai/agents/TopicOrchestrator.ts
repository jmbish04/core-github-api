/**
 * Topic Orchestrator Agent (Research Planning & Management)
 */
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { createAgent } from '@/ai/agents/honi';
import { buildMaxAgentMemory } from '@/ai/agents/memory';
import { AgentStateStore } from '@/ai/agents/support/state-store';
import { runAgentStructured } from '@/ai/agents/support/inference';
import { getDb } from '@db';
import { researchBriefs, researchPlans } from '@db/schemas/github/research';
import { ResearchLogger } from '@research-logger';

const PlanSchema = z.object({
  goals: z.array(z.string()).describe('List of high level research goals'),
  search_queries: z.array(z.string()).describe('Specific Google search queries to run'),
  required_sources: z.array(z.string()).describe('Specific websites or sources to target if any'),
});

type AgentState = {
  briefId?: string;
  status: 'idle' | 'planning' | 'researching' | 'review' | 'complete';
  history: Record<string, unknown>[];
  lastResult?: unknown;
};

const topicOrchestratorRuntime = createAgent<Env>({
  name: 'topic-orchestrator',
  model: 'claude-3-5-sonnet-latest',
  system: 'You manage research topic intake, planning, and orchestration.',
  binding: 'TOPIC_ORCHESTRATOR',
  tools: [],
  memory: buildMaxAgentMemory({
    agentName: 'TopicOrchestratorAgent',
    graphId: 'core-github-api-topic-orchestrator',
  }),
  observability: { enabled: true, aiGatewaySlug: 'core-github-api', collectEvents: true },
});

const TopicOrchestratorDurableObject = topicOrchestratorRuntime.DurableObject as new (
  ctx: DurableObjectState,
  env: Env,
) => DurableObject & { env: Env };

export class TopicOrchestratorAgent extends TopicOrchestratorDurableObject {
  declare env: Env;
  private readonly store: AgentStateStore<AgentState>;
  private readonly doState: DurableObjectState;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.env = env;
    this.doState = state;
    this.store = new AgentStateStore<AgentState>({
      ctx: state,
      env,
      agentName: 'TopicOrchestratorAgent',
      initialState: {
        status: 'idle',
        history: [],
      },
    });
  }

  async submitBrief(userId: string, title: string, content: any) {
    const db = getDb(this.env.DB);

    const [brief] = await db.insert(researchBriefs).values({
      userId,
      title,
      rawBriefContent: JSON.stringify(content),
      status: 'planning',
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    await this.store.set({ briefId: brief.id, status: 'planning', history: [] });

    const researchLogger = new ResearchLogger(db, brief.id, null, 'TopicOrchestrator', this.doState);
    await researchLogger.logInfo('Lifecycle', `Brief created: ${title}`, { briefId: brief.id });

    await this.formulatePlan(brief.id, content, researchLogger);

    return brief;
  }

  async getStatus() {
    await this.store.ready();
    return this.store.state;
  }

  private async formulatePlan(briefId: string, content: any, researchLogger: ResearchLogger) {
    await researchLogger.logThought('Planning', 'Analyzing user brief to generate research plan...');

    const db = getDb(this.env.DB);

    let plan: unknown = {};
    try {
      plan = await runAgentStructured({
        env: this.env,
        logger: this.store.logger,
        name: 'ResearchPlanner',
        instructions: `You are an expert Research Planner.
Analyze the user request and create a list of specific research questions and Google search queries.`,
        prompt: JSON.stringify(content),
        schema: PlanSchema,
      });
    } catch (error) {
      await researchLogger.logError('Planning', error);
      plan = { error: 'Failed to generate structured plan', details: String(error) };
    }

    await db.insert(researchPlans).values({
      briefId,
      currentVersion: JSON.stringify(plan),
      isApproved: false,
    });

    await researchLogger.logInfo('Planning', 'Plan generated and saved.', { plan });
    await this.store.set({
      ...this.store.state,
      briefId,
      status: 'researching',
      lastResult: plan,
      history: [...this.store.state.history, { briefId, plan }],
    });
  }
}
