/**
 * @file OrchestratorAgent/methods/parse-request.ts
 * @description Parse a user prompt into a SWARM Sprint using the centralized
 *              agent config (provider/model/instructions from D1) and the
 *              OpenAI Agents SDK routed through Cloudflare AI Gateway.
 *
 *              EdigraphService saves the incoming prompt as an episodic memory
 *              entry for cross-session context recall (fire-and-forget).
 */
import type { OrchestratorAgent } from '../index';
import type { Sprint } from '../../EngineerAgent/types';
import { EdigraphService } from '@/ai/providers';
import { z } from 'zod';
import { run } from '@openai/agents';
import { Logger } from '@/lib/logger';

const AGENT_NAME = 'OrchestratorAgent';
const FUNCTION_NAME = 'submitRequest';

const DEFAULT_SYSTEM_INSTRUCTIONS = `You are the top-level orchestrator agent.
Parse the user request into a SWARM task tree: a Sprint containing atomic Subtasks,
each assignable to a single Jules session.
Return a structured JSON object matching the sprint schema.`;

const SprintResponseSchema = z.object({
  sprint: z.object({
    id: z.string(),
    requestId: z.string().optional(),
    title: z.string(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    subtasks: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        description: z.string(),
        files: z.array(z.string()).optional(),
        role: z.enum(['solo', 'fleet-member', 'stitch', 'merge']),
      }),
    ),
  }),
  reasoning: z.string(),
});

/**
 * Parse a user request into a SWARM Task tree using the AI Gateway.
 *
 * Flow:
 * 1. Lookup D1 config (provider/model/instructions).
 * 2. Fire-and-forget EdigraphService: save prompt as episodic memory.
 * 3. Create OpenAI Agents SDK agent via AIProvider (routes through AI Gateway).
 * 4. Run the agent and parse the structured sprint response.
 */
export async function parseRequest(
  agent: OrchestratorAgent,
  prompt: string,
  repoContext: unknown,
): Promise<{ sprint: Sprint; reasoning: string }> {
  // ── 1. Load D1 config (degrades to defaults if table not yet migrated) ────
  const cfg = await (agent as any).ai.getAgentFunctionConfig(AGENT_NAME, FUNCTION_NAME);

  // ── 2. Episodic memory: fire-and-forget, never blocks the response ─────────
  if ((agent as any).env.EDGRAPH) {
    (agent as any).ctx.waitUntil(
      new EdigraphService((agent as any).env.EDGRAPH, (agent as any).ctx.id.toString()).addEpisodic(prompt, {
        role: 'user',
        function: FUNCTION_NAME,
        agent: AGENT_NAME,
      }),
    );
  }

  // ── 3. Build the full prompt ───────────────────────────────────────────────
  const aiPrompt = `${cfg?.promptTemplate ?? 'Parse the following user request into a structured sprint:\n\n'}${prompt}${
    repoContext ? `\n\nRepository Context:\n${JSON.stringify(repoContext, null, 2)}` : ''
  }

Return JSON matching the sprint schema with subtasks. Each subtask must be an atomic unit of work for a single Jules session.`;

  try {
    // ── 4a. Try structured response (most reliable) ─────────────────────────
    const parsed = await (agent as any).ai.generateStructuredResponse(
      aiPrompt,
      SprintResponseSchema,
      cfg?.systemInstructions ?? DEFAULT_SYSTEM_INSTRUCTIONS,
      {
        model: cfg?.primaryModel ?? undefined,
        ...(cfg?.primaryProvider ? { provider: cfg.primaryProvider } : {}),
      },
    );

    const sprint: Sprint = {
      id: parsed.sprint?.id || crypto.randomUUID(),
      requestId: parsed.sprint?.requestId || crypto.randomUUID(),
      title: parsed.sprint?.title || prompt.slice(0, 100),
      priority: parsed.sprint?.priority || 'medium',
      status: 'queued',
      subtasks: (parsed.sprint?.subtasks || []).map((st: any, i: number) => ({
        ...st,
        id: st.id || `subtask-${i}`,
        status: 'pending' as const,
      })),
    };

    return { sprint, reasoning: parsed.reasoning || '' };
  } catch (primaryErr) {
    // ── 4b. Fallback: OpenAI Agents SDK with secondary config ───────────────
    try {
      const agentInstance = await (agent as any).ai.createOpenAIAgentForFunction(
        AGENT_NAME,
        FUNCTION_NAME,
        { name: AGENT_NAME, instructions: cfg?.systemInstructions ?? DEFAULT_SYSTEM_INSTRUCTIONS },
      );

      const result = await run(agentInstance, aiPrompt);
      const raw = typeof result.finalOutput === 'string' ? JSON.parse(result.finalOutput) : result.finalOutput;
      const parsed = SprintResponseSchema.parse(raw);

      const sprint: Sprint = {
        id: parsed.sprint?.id || crypto.randomUUID(),
        requestId: parsed.sprint?.requestId || crypto.randomUUID(),
        title: parsed.sprint?.title || prompt.slice(0, 100),
        priority: parsed.sprint?.priority || 'medium',
        status: 'queued',
        subtasks: (parsed.sprint?.subtasks || []).map((st: any, i: number) => ({
          ...st,
          id: st.id || `subtask-${i}`,
          status: 'pending' as const,
        })),
      };

      return { sprint, reasoning: parsed.reasoning || '' };
    } catch (fallbackErr) {
      const logger = new Logger((agent as any).env, 'OrchestratorAgent');
      logger.error('All AI providers failed:', { primaryErr: String(primaryErr), fallbackErr: String(fallbackErr) });
    }

    // ── 4c. Last resort: single solo task ────────────────────────────────────
    return {
      sprint: {
        id: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
        title: prompt.slice(0, 100),
        priority: 'medium',
        status: 'queued',
        subtasks: [
          {
            id: 'subtask-0',
            title: prompt.slice(0, 100),
            description: prompt,
            role: 'solo',
            status: 'pending',
          },
        ],
      },
      reasoning: 'Fallback: all AI providers failed; created single solo task.',
    };
  }
}
