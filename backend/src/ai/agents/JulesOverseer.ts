/**
 * Jules Overseer Agent (Asynchronous Agent Manager)
 */
import { z } from 'zod';
import { eq, notInArray, desc } from 'drizzle-orm';
import { createAgent } from '@/ai/agents/honi';
import { buildMaxAgentMemory } from '@/ai/agents/memory';
import { AgentStateStore } from '@/ai/agents/support/state-store';
import { runAgentText, resolveAgentModel, resolveAgentProvider } from '@/ai/agents/support/inference';
import type { AgentTool, PersistentAgentState } from '@/ai/agents/support/types';
import { getDb } from '@db';
import { julesSessions, julesJobs } from '@db/schemas/jules';
import { alerts } from '@/db/schemas/app/alerts';
import { JulesService } from '@/services/jules/service';

type SessionCheckResult = {
  sessionId: string;
  status: string;
  actionTaken: string;
};

const julesOverseerRuntime = createAgent<Env>({
  name: 'jules-overseer',
  model: 'claude-3-5-sonnet-latest',
  system: 'You supervise long-running Jules sessions and unblock them when necessary.',
  binding: 'JULES_OVERSEER',
  tools: [],
  memory: buildMaxAgentMemory({
    agentName: 'JulesOverseer',
    graphId: 'core-github-api-jules-overseer',
  }),
  observability: { enabled: true, aiGatewaySlug: 'core-github-api', collectEvents: true },
});

const JulesOverseerDurableObject = julesOverseerRuntime.DurableObject as new (
  ctx: DurableObjectState,
  env: Env,
) => DurableObject & {
  env: Env;
  fetch(request: Request): Promise<Response>;
};

export class JulesOverseer extends JulesOverseerDurableObject {
  declare env: Env;
  private readonly store: AgentStateStore<PersistentAgentState>;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.env = env;
    this.store = new AgentStateStore<PersistentAgentState>({
      ctx: state,
      env,
      agentName: 'JulesOverseer',
      initialState: { status: 'idle', history: [] },
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/schedule/check') {
      return Response.json(await this.checkJulesStatus());
    }
    return super.fetch(request);
  }

  async checkJulesStatus(): Promise<SessionCheckResult[]> {
    const db = getDb(this.env.DB);
    const julesService = JulesService.getInstance(this.env);
    const results: SessionCheckResult[] = [];

    await this.store.setStatus('running');

    const activeJobs = await db.select()
      .from(julesJobs)
      .where(notInArray(julesJobs.status, ['completed', 'failed']))
      .orderBy(desc(julesJobs.createdAt))
      .limit(20);

    this.store.logger.info(`Checking ${activeJobs.length} active jobs`);

    for (const job of activeJobs) {
      try {
        const session = await julesService.getSession(job.sessionId);

        let status = 'unknown';
        let julesContext: any = null;

        try {
          const info = await session.info();
          status = info.state || 'running';
          julesContext = info || 'No context available';
        } catch {
          status = 'running';
        }

        if (status === 'completed' || status === 'failed' || status === 'ready_for_pr') {
          if (status === 'ready_for_pr' || status === 'completed') {
            await julesService.sendMessage(job.sessionId, 'The changes look good. Please proceed to submit the Pull Request.');

            await db.insert(alerts).values({
              id: crypto.randomUUID(),
              title: 'Jules Remediation Completed',
              description: `Jules has finished the assigned task and submitted a PR for session ${job.sessionId}. Human review of the PR is recommended.`,
              process_origin: 'JulesOverseer',
              repo_origin: job.repoFullName,
              worker_origin: 'core-github-api',
              is_action_needed: true,
              action_required: 'Review generated Pull Request in GitHub',
            });
          }

          await db.update(julesJobs).set({ status: 'completed' }).where(eq(julesJobs.id, job.id));
          await db.update(julesSessions).set({ status: 'completed' }).where(eq(julesSessions.id, job.sessionId));
          results.push({ sessionId: job.sessionId, status, actionTaken: 'marked_completed' });
        } else if (status === 'waiting_for_user') {
          this.store.logger.info(`Session ${job.sessionId} is stuck. Booting AI Manager...`);

          if (job.status !== 'blocked') {
            await db.update(julesJobs).set({ status: 'blocked' }).where(eq(julesJobs.id, job.id));
          }

          const instructions = await this.evaluateStuckJules(julesContext);
          await julesService.sendMessage(job.sessionId, instructions);
          results.push({ sessionId: job.sessionId, status, actionTaken: 'unblocked_via_ai' });
        } else {
          results.push({ sessionId: job.sessionId, status, actionTaken: 'monitoring' });
        }
      } catch (error: any) {
        this.store.logger.error(`Failed to inspect job ${job.id}`, { error: error.message });
        results.push({ sessionId: job.sessionId, status: 'error', actionTaken: 'error' });
      }
    }

    await this.store.set({ ...this.store.state, status: 'completed', lastResult: results });
    return results;
  }

  async scheduled(_event: ScheduledEvent) {
    this.store.logger.info('Running scheduled check...');
    await this.checkJulesStatus();
  }

  private async evaluateStuckJules(julesContext: any): Promise<string> {
    const systemPrompt = `You are the Jules Overseer, an AI Engineering Manager overseeing an asynchronous coding agent named Jules.
Jules is currently working on the repository \`jmbish04/core-github-api\` but has become stuck and is waiting for your instructions.

YOUR DIRECTIVE:
1. Review Jules's current status and the error/roadblock they are facing.
2. If Jules is confused about Cloudflare-specific implementations, provide authoritative guidance.
3. Formulate a clear, authoritative, and step-by-step response to unblock Jules and guide it toward the correct implementation.
4. If Jules reports that the code is complete and asks for review/approval, explicitly instruct Jules to "Proceed to submit the Pull Request."`;

    const userPrompt = `Jules is stuck. Here is their current context and last message:\n${JSON.stringify(julesContext, null, 2)}`;

    try {
      const julesService = JulesService.getInstance(this.env);
      const provider = resolveAgentProvider(this.env);
      const model = resolveAgentModel(this.env, provider);

      const tools: AgentTool[] = [
        {
          name: 'get_session_info',
          description: 'Get detailed information about a Jules session to understand why it is stuck.',
          parameters: z.object({ sessionId: z.string() }),
          execute: async (args: Record<string, unknown>) => {
            try {
              const session = await julesService.getSession(String(args.sessionId || ''));
              return await session.info();
            } catch (error: any) {
              return { error: error.message };
            }
          },
        },
        {
          name: 'get_session_snapshot',
          description: 'Get a point-in-time snapshot of the session including the full filesystem state and history.',
          parameters: z.object({ sessionId: z.string() }),
          execute: async (args: Record<string, unknown>) => {
            try {
              return await julesService.getSessionSnapshot(String(args.sessionId || ''), { includeActivities: false });
            } catch (error: any) {
              return { error: error.message };
            }
          },
        },
      ];

      return await runAgentText({
        env: this.env,
        logger: this.store.logger,
        name: 'JulesOverseer',
        instructions: systemPrompt,
        prompt: userPrompt,
        provider,
        model,
        tools,
      });
    } catch (error) {
      this.store.logger.error('Failed to evaluate stuck Jules session', { error });
      return 'Please review the files, consult standard Cloudflare Worker documentation, and try an alternative approach.';
    }
  }
}
