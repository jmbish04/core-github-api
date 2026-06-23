/**
 * @file src/ai/providers/agent-support/base-chat-agent.ts
 * @description BaseChatAgent for chat-oriented agents with dynamic skill extraction
 */
import { AIChatAgent } from 'agents/ai-chat-agent';
import { callable, StreamingResponse } from 'agents';
import { AIProvider } from '@/ai/providers';
import { AgentStateStore } from './state-store';
import { Logger } from '@/lib/logger';
import { HitlQueue } from './hitl-queue';
import { PeerEventSchema, type PeerEvent } from './base-agent';
import type { PersistentAgentState } from './types';
import {
  type HealthMode,
  type HealthReport,
  type HealthCheck,
  type HealthCheckFn,
  type PeerBindingDescriptor,
  runChecks,
  aggregateStatus,
  buildSummary,
  FAST_TIMEOUT_MS,
  DEEP_TIMEOUT_MS,
  checkBindingSanity,
  checkAIProviderInit,
  checkStateStoreRoundTrip,
  checkSkillManagerReachability,
  checkEdigraphConnectivity,
  checkHitlQueueDryRun,
  checkCollabBindingResolution,
  getChatChecks,
} from './health';

export abstract class BaseChatAgent<State extends PersistentAgentState = PersistentAgentState> extends AIChatAgent<Env, State> {
  protected ai!: AIProvider;
  protected stateStore!: AgentStateStore<State>;
  protected logger!: Logger;
  protected hitl!: HitlQueue;
  protected streamController: ReadableStreamDefaultController | null = null;
  /** Active @callable streaming consumers keyed by channel name. */
  private _streamConsumers = new Map<string, StreamingResponse>();
  
  /**
   * Static skills configured for the agent class.
   */
  protected abstract get skills(): string[];

  /**
   * The name of this agent (e.g., 'AssistantAgent')
   */
  protected abstract get agentName(): string;

  /**
   * Peer agent bindings this agent depends on for collaboration.
   * Override in subclasses to declare required/optional peers.
   * Layer 2 (B7) checks resolve these bindings during health probes.
   */
  protected get peerAgentBindings(): Record<string, PeerBindingDescriptor> {
    return {};
  }

  // ── Public Accessors ──────────────────────────────────────────────────
  // Method files receive the agent as a typed parameter and cannot access
  // `protected` members. These getters provide clean, typed access.

  /** Public accessor for the agent's environment bindings. */
  public getEnv(): Env { return this.env; }
  /** Public accessor for the AI provider instance. */
  public getAI(): AIProvider { return this.ai; }
  /** Public accessor for the logger instance. */
  public getLogger(): Logger { return this.logger; }
  /** Public accessor for the state store. */
  public getStateStore(): AgentStateStore<State> { return this.stateStore; }
  /** Public accessor for the configured skills list. */
  public getSkills(): string[] { return this.skills; }
  /** Public accessor for the agent name. */
  public getAgentName(): string { return this.agentName; }

  /**
   * Initial state shape for the agent.
   */
  initialState: State = {} as State;

  /**
   * Lifecycle method to initialize agent-specific resources.
   * Runs before skill warming.
   */
  protected abstract agentInit(): Promise<void>;

  /**
   * Extracted from X-Agent-Skills header during onRequest
   */
  private _requestSkills: string[] = [];

  override async onStart(): Promise<void> {
    await super.onStart(); // Required for AIChatAgent behavior

    this.logger = new Logger(this.env as any, this.agentName);
    this.ai = new AIProvider(this.env as any);
    
    this.stateStore = new AgentStateStore<State>({
      ctx: this.ctx,
      env: this.env as any,
      agentName: this.agentName,
      initialState: this.initialState
    });

    this.hitl = new HitlQueue(this.env as any);

    // embedded SQLite tracking for peer events
    void this.sql`
      CREATE TABLE IF NOT EXISTS peer_events_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sourceAgent TEXT,
        eventType TEXT,
        payloadJson TEXT,
        timestamp TEXT
      )
    `;

    await this.agentInit();

    const configuredSkills = this.skills;
    if (configuredSkills && configuredSkills.length > 0) {
      this.ctx.waitUntil(
        this.ai.warmSkillCache(configuredSkills).catch(error => {
          this.logger.warn("Failed to warm skill cache during onStart", { error });
        })
      );
    }
  }

  /**
   * Extracts X-Agent-Skills header from incoming requests.
   * Note: The X-Agent-Skills header protocol expects comma-separated D1 skill names (lowercase, hyphen-separated).
   * Empty or absent header means only static skills are used.
   */
  override async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/stream') {
      const stream = new ReadableStream({
        start: (controller) => {
          this.streamController = controller;
        },
        cancel: () => {
          this.streamController = null;
        }
      });

      request.signal.addEventListener('abort', () => {
        this.streamController = null;
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        }
      });
    }

    this._requestSkills = [];
    if (this.ai && this.ai.skills) {
      this._requestSkills = this.ai.skills.extractHeaders(request);
    }
    return super.onRequest(request);
  }

  protected notifyStream(data: any): void {
    if (this.streamController) {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      try {
        this.streamController.enqueue(new TextEncoder().encode(`data: ${payload}\n\n`));
      } catch (err) {
        this.logger?.error("Failed to enqueue to stream", { error: err });
      }
    }
  }

  // ── @callable SSE Streaming ──────────────────────────────────────────

  /**
   * Open a named SSE channel via the Agents SDK streaming RPC.
   * Clients call: agent.call("streamEvents", [channel], { stream: { onChunk, onDone } })
   *
   * The stream stays open until the agent calls emitStreamEvent with `__done`
   * or the client disconnects.
   */
  @callable({ streaming: true })
  public streamEvents(stream: StreamingResponse, channel = 'default'): void {
    this._streamConsumers.set(channel, stream);
    stream.send({ type: 'connected', channel, agent: this.agentName, timestamp: Date.now() });
  }

  /**
   * Emit a structured event to ALL connected streaming consumers
   * (both @callable StreamingResponse channels AND legacy ReadableStream).
   *
   * Call with `{ type: '__done' }` to gracefully close all streams.
   */
  protected emitStreamEvent(data: Record<string, unknown>, channel = 'default'): void {
    // Legacy ReadableStream path
    this.notifyStream(data);

    // @callable StreamingResponse path
    const consumer = this._streamConsumers.get(channel);
    if (!consumer || consumer.isClosed) {
      this._streamConsumers.delete(channel);
      return;
    }

    if (data.type === '__done') {
      consumer.end(data);
      this._streamConsumers.delete(channel);
    } else {
      consumer.send(data);
    }
  }

  /**
   * Close all active streaming channels. Called during graceful shutdown.
   */
  protected closeAllStreams(): void {
    for (const [channel, consumer] of this._streamConsumers) {
      if (!consumer.isClosed) {
        consumer.end({ type: '__done', reason: 'agent_shutdown' });
      }
      this._streamConsumers.delete(channel);
    }
    if (this.streamController) {
      try { this.streamController.close(); } catch { /* already closed */ }
      this.streamController = null;
    }
  }

  /**
   * Subclasses should call this to resolve the effective skills and augmented system prompt
   */
  protected async resolveSystemPrompt(baseSystemInstructions?: string): Promise<string> {
    const effectiveSkills = this.ai.skills.resolveEffective(this.skills, this._requestSkills);
    const skillCtx = await this.ai.skills.getSkillInstructions(effectiveSkills);
    
    return [baseSystemInstructions, skillCtx]
      .filter(Boolean)
      .join('\n\n');
  }

  /**
   * SILOED COLLABORATION: 
   * Connects to a peer backend agent working on the same session ID.
   */
  protected getPeerAgent<T>(binding: any): T {
    if (!binding || typeof binding.idFromName !== 'function') {
      throw new Error(`Invalid binding provided to getPeerAgent for ${this.agentName}`);
    }
    const id = binding.idFromName(this.name);
    return binding.get(id) as unknown as T;
  }

  /**
   * Public RPC method allowing background agents (like Guardrail) to inject
   * messages directly into the user-facing chat stream or trigger internal logic.
   */
  @callable()
  public async receivePeerEvent(event: PeerEvent): Promise<void> {
    const validated = PeerEventSchema.parse(event);
    
    void this.sql`
      INSERT INTO peer_events_log (sourceAgent, eventType, payloadJson, timestamp)
      VALUES (${validated.sourceAgent}, ${validated.eventType}, ${JSON.stringify(validated.payload)}, ${new Date().toISOString()})
    `;

    // Cold-path: D1 mirror (async, non-blocking)
    const sessionId = this.name;
    this.ctx.waitUntil((async () => {
      try {
        const db = this.env.DB as any;
        if (db) {
           await db.prepare(`
             INSERT INTO collaboration_events (session_id, source_agent, event_type, payload_json)
             VALUES (?, ?, ?, ?)
           `).bind(sessionId, validated.sourceAgent, validated.eventType, JSON.stringify(validated.payload)).run();
        }
      } catch (err) {
        this.logger.error("Failed to mirror peer event to D1", { error: err });
      }
    })());

    // If the event is meant for the human/frontend, broadcast it to Assistant-UI
    if (validated.eventType === 'ui_broadcast') {
      const msgContent = validated.payload?.message 
        ? `[System Notification from ${validated.sourceAgent}]: ${validated.payload.message}` 
        : `[System Notification from ${validated.sourceAgent}]`;

      // Dispatch to connected frontends currently streaming
      this.broadcast(JSON.stringify({
        type: 'message',
        role: 'assistant',
        content: msgContent
      }));
      
      // Persist to AIChatAgent's native message history
      await this.saveMessages([{
        role: 'assistant',
        content: msgContent
      } as any]);
    }

    await this.onPeerEvent(validated);
  }

  /**
   * Lifecycle hook to be overridden by subclasses.
   */
  protected async onPeerEvent(_event: PeerEvent): Promise<void> {
    // Override in subclass (e.g. EngineerAgent reacting to Guardrail feedback)
    this.logger.info(`[onPeerEvent] Received peer event: ${JSON.stringify(_event)}; Override in subclass (e.g. EngineerAgent reacting to Guardrail feedback)`);
  }

  /**
   * Helper to verify the correct message schema when dealing with AI SDK and native APIs.
   */
  protected verifyChatFormat(messages: any[]): boolean {
    return Array.isArray(messages) && messages.every(m => typeof m === 'object' && m !== null && typeof m.role === 'string' && typeof m.content === 'string');
  }

  // To maintain compatibility with AIChatAgent, onChatMessage should be implemented by subclasses
  // or overridden here if AIChatAgent requires it.
  
  // ── Layer 3 Extension Point ──────────────────────────────────────────

  /**
   * Override in subclasses to add domain-specific health checks (Layer 3).
   * These run AFTER the inherited base + chat checks.
   * Return an empty array if no agent-specific checks are needed.
   */
  protected async agentHealthChecks(_mode: HealthMode): Promise<HealthCheck[]> {
    return [];
  }

  // ── Diagnostic Health Probe ──────────────────────────────────────────

  /**
   * Layered diagnostic health probe for chat agents.
   *
   * Inherits all BaseAgent checks (B1–B7) and adds:
   *   C1: AIChatAgent internals (messages, saveMessages, broadcast)
   *   C2: Stream shape sanity (zero tokens)
   *   C3: Workers AI chat round-trip (DEEP MODE ONLY)
   *
   * @param opts.mode - 'fast' (cron, ≤2s, zero tokens) or 'deep' (user-triggered, ≤30s)
   */
  @callable()
  public async healthProbe(opts?: { mode?: HealthMode }): Promise<HealthReport> {
    const mode: HealthMode = opts?.mode ?? 'fast';
    const probeStart = Date.now();
    const timeoutMs = mode === 'fast' ? FAST_TIMEOUT_MS : DEEP_TIMEOUT_MS;

    // ── Layer 2: Base checks (B1–B7) ──────────────────────────────
    const baseCheckFns: HealthCheckFn[] = [
      ...checkBindingSanity(this.env, ['DB', 'AI'], ['EDGRAPH', 'SKILLS_KV']),
      checkAIProviderInit(this.ai),
      checkStateStoreRoundTrip(this.stateStore, this.agentName, this.sql?.bind(this)),
      checkSkillManagerReachability(this.ai, this.skills ?? [], this.env),
      checkEdigraphConnectivity(this.env),
      checkHitlQueueDryRun(this.env, this.agentName),
      ...checkCollabBindingResolution(this.env, this.peerAgentBindings, mode),
    ];

    // ── Layer 2: Chat-specific checks (C1–C3) ─────────────────────
    const chatCheckFns = getChatChecks(this, this.env, mode);

    // ── Run all Layer 2 in parallel ─────────────────────────────────
    const allLayer2 = [...baseCheckFns, ...chatCheckFns];
    const layer2Results = await runChecks(allLayer2, { timeoutMs });

    // ── Layer 3: Per-agent checks ───────────────────────────────────
    let agentChecks: HealthCheck[] = [];
    try {
      agentChecks = await this.agentHealthChecks(mode);
    } catch (err: any) {
      agentChecks = [{
        name: 'agent.healthChecks.error',
        layer: 3,
        category: 'custom',
        status: 'fail',
        durationMs: 0,
        message: 'agentHealthChecks() threw an exception',
        error: err.message,
      }];
    }

    // ── Aggregate ────────────────────────────────────────────────────
    const allChecks = [...layer2Results, ...agentChecks];
    const status = aggregateStatus(allChecks);
    const summary = buildSummary(allChecks);

    return {
      agent: this.agentName,
      status,
      mode,
      durationMs: Date.now() - probeStart,
      timestamp: new Date().toISOString(),
      checks: allChecks,
      summary,
    };
  }
}
