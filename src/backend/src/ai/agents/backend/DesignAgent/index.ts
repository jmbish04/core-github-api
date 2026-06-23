/**
 * @file DesignAgent/index.ts
 * @description DesignAgent — Agent with Stitch SDK tools.
 *              Gives the AI the ability to create and manage Stitch UI design
 *              projects, generate screens from text prompts, and retrieve
 *              generated HTML/screenshots.
 */

import { callable } from 'agents';
import { type PersistentAgentState } from '@/ai/providers';
import { buildStitchTools } from './methods/stitch-tools';
import { runUxResearchPipeline, type UxRunParams } from './methods/ux-research';
import type { StitchChatInput } from './types';
import { Logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// System prompt cache
// ---------------------------------------------------------------------------

let _systemPromise: Promise<string> | null = null;

export async function buildSystemPrompt(_env: Env, logger: Logger): Promise<string> {
  const logPrefix = `[DesignAgent - buildSystemPrompt]`;
  if (!_systemPromise) {
    logger.info(`${logPrefix} System prompt not found, building...`);
    _systemPromise = Promise.resolve(`You are an expert UI/UX design agent with access to the Google Stitch design generation service.

## Your capabilities
- Create Stitch design projects
- Generate high-fidelity UI screens from text prompts
- Retrieve and inspect generated screens (HTML, screenshots)
- Generate multiple visual variants of existing screens

## Prompt enhancement pattern
When the user gives a vague request like "create a dashboard", enhance it:
"Create a modern dark-mode dashboard with glassmorphism cards, Inter typography,
24px grid spacing, sidebar navigation, KPI stat cards with animated counters,
a line chart using shadcn/recharts, and a recent activity feed."

## Output format
Always return structured JSON with projectId, screenId, and screenshotUrl when available.`);
  }
  logger.info(`${logPrefix} System prompt built, returning...\n\n${await _systemPromise}`);
  return _systemPromise;
}

// ---------------------------------------------------------------------------
// Agent class
// ---------------------------------------------------------------------------

import { BaseAgent } from '@/ai/providers';

export class DesignAgent extends BaseAgent<PersistentAgentState> {
  protected get skills() {
    return ['ui-design', 'ux-research', 'stitch-patterns'];
  }
  protected get agentName() {
    return 'DesignAgent';
  }

  protected get peerAgentBindings(): Record<string, import('@/ai/providers/agent-support/health').PeerBindingDescriptor> {
    return {
      ENGINEER_AGENT: { bindingKey: 'ENGINEER_AGENT', required: true }
    };
  }

  initialState: PersistentAgentState = { status: 'idle', history: [] };

  async agentInit(): Promise<void> {
    // ai and logger are inherited from BaseAgent
    this.logger.info(`[DesignAgent - agentInit] DesignAgent initialized`);
  }

  // Layer 3 health: no agent-specific checks (base handles all common probes)

  @callable()
  async chat(input: StitchChatInput): Promise<string> {
    this.logger.info(`Chat request: ${input.message.slice(0, 100)}...`);

    const systemPrompt = await buildSystemPrompt(this.env, this.logger);
    const tools = buildStitchTools(this.env);

    const res = await this.ai.chat.chatWithTools(
      [{ role: 'user', content: input.message }],
      tools,
      systemPrompt,
      { model: input.model || 'gemini-3-flash-preview', skills: this.skills },
    );

    return res.text;
  }

  /**
   * Starts the full UX research pipeline (Jules analysis → Stitch generation → Jules fleet build).
   * Absorbed from UxResearcher — runs as a background task.
   */
  @callable()
  async startUxPipeline(params: {
    runId: string;
    repoOwner: string;
    repoName: string;
    mode?: 'autopilot' | 'hitl';
    context?: string;
    repoUrl?: string;
    registriesContext?: string;
  }) {
    this.logger.info(`Starting UX pipeline: ${params.repoOwner}/${params.repoName}`);

    const uxParams: UxRunParams = {
      runId: params.runId,
      repoOwner: params.repoOwner,
      repoName: params.repoName,
      mode: params.mode || 'autopilot',
      backendContext: params.context || '',
      repoUrl: params.repoUrl || '',
      registriesContext: params.registriesContext || '',
    };

    // Fire-and-forget via waitUntil
    this.ctx.waitUntil(
      runUxResearchPipeline(this, uxParams, (event, data) => {
        this.logger.info(`[ux-pipeline] ${event}`, data);
      }),
    );

    return { success: true, runId: params.runId };
  }

  /**
   * Streaming variant of startUxPipeline — sends real-time progress events
   * via @callable SSE streaming instead of fire-and-forget logging.
   *
   * Client usage: agent.call("streamPipeline", [params], { stream: { onChunk } })
   */
  @callable({ streaming: true })
  async streamPipeline(
    stream: import('agents').StreamingResponse,
    params: {
      runId: string;
      repoOwner: string;
      repoName: string;
      mode?: 'autopilot' | 'hitl';
      context?: string;
      repoUrl?: string;
      registriesContext?: string;
    },
  ) {
    this.logger.info(`[streamPipeline] Starting streamed UX pipeline: ${params.repoOwner}/${params.repoName}`);

    const uxParams: UxRunParams = {
      runId: params.runId,
      repoOwner: params.repoOwner,
      repoName: params.repoName,
      mode: params.mode || 'autopilot',
      backendContext: params.context || '',
      repoUrl: params.repoUrl || '',
      registriesContext: params.registriesContext || '',
    };

    stream.send({ type: 'pipeline:started', runId: params.runId, timestamp: Date.now() });

    try {
      await runUxResearchPipeline(this, uxParams, (event, data) => {
        this.logger.info(`[streamPipeline] ${event}`, data);
        stream.send({ type: `pipeline:${event}`, ...data, timestamp: Date.now() });
      });

      stream.end({ type: 'pipeline:complete', runId: params.runId, timestamp: Date.now() });
    } catch (err: any) {
      this.logger.error(`[streamPipeline] Pipeline failed`, { error: err.message });
      stream.error(err.message);
    }
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json(await this.healthProbe());
    }

    if (url.pathname === '/chat' && request.method === 'POST') {
      const body = (await request.json()) as { message?: string; model?: string };
      const result = await this.chat({
        message: body.message || '',
        model: body.model,
      });
      return Response.json({ response: result });
    }

    if (url.pathname === '/ux-research' && request.method === 'POST') {
      const body = (await request.json()) as any;
      const result = await this.startUxPipeline(body);
      return Response.json(result);
    }

    // Fall through to BaseAgent.onRequest for /stream and agent SDK routing
    return super.onRequest(request);
  }
}
