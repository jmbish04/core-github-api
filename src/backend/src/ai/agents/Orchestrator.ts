/**
 * Orchestrator Agent (Main Routing & Delegation)
 */
import { createAgent } from '@/ai/agents/honi';
import { buildMaxAgentMemory } from '@/ai/agents/memory';
import { AgentStateStore } from '@/ai/agents/support/state-store';
import { runAgentText } from '@/ai/agents/support/inference';
import type { PersistentAgentState } from '@/ai/agents/support/types';
import { callable } from '@/ai/agents/runtime/agents';
import { HoniClient } from '@utils/honi-client';
import { generateUuid } from '@/utils/common';

const orchestratorRuntime = createAgent<Env>({
  name: 'orchestrator',
  model: 'claude-3-5-sonnet-latest',
  system: 'You are a concise and helpful engineering assistant.',
  binding: 'ORCHESTRATOR',
  tools: [],
  memory: buildMaxAgentMemory({
    agentName: 'OrchestratorAgent',
    graphId: 'core-github-api-orchestrator',
  }),
  observability: { enabled: true, aiGatewaySlug: 'core-github-api', collectEvents: true },
});

const OrchestratorDurableObject = orchestratorRuntime.DurableObject as new (
  ctx: DurableObjectState,
  env: Env,
) => DurableObject & { env: Env };

type OrchestratorState = PersistentAgentState & {
  sessionId?: string;
};

export class OrchestratorAgent extends OrchestratorDurableObject {
  declare env: Env;
  private readonly store: AgentStateStore<OrchestratorState>;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.env = env;
    this.store = new AgentStateStore<OrchestratorState>({
      ctx: state,
      env,
      agentName: 'OrchestratorAgent',
      loggerNamespace: 'orchestrator/main',
      initialState: { status: 'idle', history: [] },
    });
  }

  @callable()
  healthProbe() {
    return {
      status: 'ok',
      agent: 'OrchestratorAgent',
      timestamp: new Date().toISOString(),
    };
  }

  @callable()
  async start(prompt: string) {
    this.store.logger.info(`Starting new session with prompt: ${prompt}`);
    const sessionId = generateUuid();
    await this.store.set({
      ...this.store.state,
      sessionId,
      status: 'running',
      history: [...this.store.state.history, { type: 'session_started', prompt, sessionId }],
    });
    return { sessionId, message: 'Session started' };
  }

  @callable()
  async getStatus(_id?: string) {
    await this.store.ready();
    return this.store.state;
  }

  async plan(input: string): Promise<any> {
    try {
      this.store.logger.info(`Planning for goal: ${input}`);
      const plannerStub = HoniClient.getStub(this.env.PLANNER as any, 'global-planner') as any;
      const planResponse = await plannerStub.fetch(
        new Request('http://agent/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ goal: input }),
        }),
      );

      if (!planResponse.ok) {
        throw new Error(`Planner failed: ${planResponse.status} ${await planResponse.text()}`);
      }

      const planJson = await planResponse.json();
      await this.store.appendHistory({ type: 'plan', input, plan: planJson });
      return planJson;
    } catch (error: any) {
      this.store.logger.error('Planning failed', { error: error.message });
      throw error;
    }
  }

  async onMessage(connection: WebSocket, message: string) {
    if (!message?.trim()) {
      connection.send(JSON.stringify({ type: 'error', content: 'Message is required' }));
      return;
    }

    try {
      if (message.toLowerCase().includes('plan')) {
        connection.send(JSON.stringify({ type: 'status', content: 'Contacting Planner Agent...' }));
        const planResult = await this.plan(message);
        connection.send(JSON.stringify({ type: 'tool-result', toolName: 'create_plan', result: planResult }));
        return;
      }

      const response = await runAgentText({
        env: this.env,
        logger: this.store.logger,
        name: 'Orchestrator',
        instructions: 'You are a senior orchestrator responsible for planning and delegating tasks.',
        prompt: message,
      });
      connection.send(JSON.stringify({ type: 'text', content: response }));
    } catch (error: any) {
      connection.send(JSON.stringify({ type: 'error', content: `Execution failed: ${error.message}` }));
    }
  }
}
