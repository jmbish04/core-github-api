import { eq } from 'drizzle-orm';
import { createAgent } from '@/ai/agents/honi';
import { buildMaxAgentMemory } from '@/ai/agents/memory';
import { AgentStateStore } from '@/ai/agents/support/state-store';
import { runAgentText } from '@/ai/agents/support/inference';
import { runStructuredChat, type StructuredChatResult, type StructuredChatState } from '@/ai/agents/support/structured-chat';
import { withFullCodeOutputRules } from '@/ai/utils/code-output-rules';
import { getDb, workshopProjects, workshopProjectTasks } from '@db';
import { createOrGetRepositoryForProject } from '@services/repository-sync';

export interface WorkshopAgentState extends StructuredChatState {
  activeProjectId?: string;
}

const workshopRuntime = createAgent<Env>({
  name: 'workshop-agent',
  model: 'claude-3-5-sonnet-latest',
  system: 'You are the Workshop Orchestrator, an expert Cloudflare Workers architect.',
  binding: 'WORKSHOP_AGENT',
  tools: [],
  memory: buildMaxAgentMemory({
    agentName: 'WorkshopAgent',
    graphId: 'core-github-api-workshop-agent',
  }),
  observability: { enabled: true, aiGatewaySlug: 'core-github-api', collectEvents: true },
});

const WorkshopDurableObject = workshopRuntime.DurableObject as new (
  ctx: DurableObjectState,
  env: Env,
) => DurableObject & {
  env: Env;
  fetch(request: Request): Promise<Response>;
};

export class WorkshopAgent extends WorkshopDurableObject {
  declare env: Env;
  private readonly store: AgentStateStore<WorkshopAgentState>;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.env = env;
    this.store = new AgentStateStore<WorkshopAgentState>({
      ctx: state,
      env,
      agentName: 'WorkshopAgent',
      initialState: {
        status: 'idle',
        history: [],
        repoContext: null,
        mcpCache: {},
      },
    });
  }

  private async getSystemPromptBase(): Promise<string> {
    return withFullCodeOutputRules(`You are the Workshop Orchestrator, an expert Cloudflare Workers architect.
Your responsibilities:
- Analyse user project requirements and decompose them into phased tasks.
- Coordinate specialist agents (Database, API, Frontend, AI) to build complete Cloudflare Worker applications.
- Ensure all generated plans are aligned with Drizzle ORM, Hono, and Astro best practices.
- Track project state via the WorkshopAgent Durable Object and persist progress to D1.
Always respond with structured, actionable output that can be rendered in the Workshop Wizard UI.`);
  }

  healthProbe() {
    return {
      status: 'ok',
      agent: 'WorkshopAgent',
      timestamp: new Date().toISOString(),
    };
  }

  async chat(
    message: string,
    history: unknown[] = [],
    context?: unknown,
    source = 'api',
    sessionId = 'default',
    requestedModel?: string,
  ): Promise<StructuredChatResult> {
    const systemPrompt = await this.getSystemPromptBase();
    return runStructuredChat({
      env: this.env,
      store: this.store,
      agentName: 'WorkshopAgent',
      systemPrompt,
      message,
      history,
      context,
      source,
      sessionId,
      requestedModel,
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/chat') {
      const payload = await request.json<{
        message?: string;
        history?: unknown[];
        context?: unknown;
        source?: string;
        sessionId?: string;
        model?: string;
      }>();
      return Response.json(
        await this.chat(
          payload.message || '',
          payload.history || [],
          payload.context,
          payload.source || 'api',
          payload.sessionId || 'default',
          payload.model,
        ),
      );
    }

    return super.fetch(request);
  }

  async orchestrateTasks(projectId: string) {
    this.store.logger.info(`Orchestrating tasks for project ${projectId}`);
    return { success: true, message: 'Tasks orchestrated' };
  }

  async initializeRepository(projectId: string, params: { owner?: string; description?: string; visibility?: 'public' | 'private' }) {
    this.store.logger.info(`Initializing repository for project ${projectId}`);

    const db = getDb(this.env.DB);
    const proj = await db.select().from(workshopProjects).where(eq(workshopProjects.id, projectId)).limit(1);
    if (!proj[0]) {
      throw new Error(`Project ${projectId} not found.`);
    }

    const repoCreation = await createOrGetRepositoryForProject(this.env, {
      projectName: proj[0].name,
      description: params.description,
      owner: params.owner,
      visibility: params.visibility,
    });

    const repoUrl = `https://github.com/${repoCreation.owner}/${repoCreation.repoName}`;

    await db.update(workshopProjects).set({ status: 'active', repoUrl }).where(eq(workshopProjects.id, projectId));
    await this.store.set({
      ...this.store.state,
      activeProjectId: projectId,
      status: 'completed',
      lastResult: { repoUrl },
      history: [...this.store.state.history, { type: 'repository_initialized', projectId, repoUrl }],
    });

    return { success: true, repoUrl };
  }

  async ingestProjectPlan(projectId: string, jsonPayload: string) {
    const prompt = `You are a strict JSON parser for specialist workshop agents. Validate and extract the exact fields required by the Project Tasks Schema.
Ensure project_name, generated_date, total_phases, and the deeply nested phases array are perfectly formatted.
Payload: ${jsonPayload}`;

    const raw = await runAgentText({
      env: this.env,
      logger: this.store.logger,
      name: 'WorkshopPlanParser',
      instructions: await this.getSystemPromptBase(),
      prompt,
    });

    const jsonString = raw.replace(/```json\n/g, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(jsonString) as any;

    const db = getDb(this.env.DB);
    await db.delete(workshopProjectTasks).where(eq(workshopProjectTasks.projectId, projectId));
    await db.insert(workshopProjectTasks).values({
      id: crypto.randomUUID(),
      projectId,
      projectName: parsedData.project_name,
      generatedDate: parsedData.generated_date || new Date().toISOString(),
      totalPhases: parsedData.total_phases,
      phases: parsedData.phases,
    });

    await this.store.set({
      ...this.store.state,
      activeProjectId: projectId,
      status: 'completed',
      lastResult: parsedData,
      history: [...this.store.state.history, { type: 'project_plan_ingested', projectId }],
    });

    return parsedData;
  }
}
