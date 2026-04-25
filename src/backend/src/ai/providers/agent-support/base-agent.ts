import { Agent, callable, StreamingResponse } from 'agents';
import { z } from 'zod';
import { AIProvider } from '@/ai/providers';
import { AgentStateStore } from './state-store';
import { Logger } from '@/lib/logger';
import { HitlQueue } from './hitl-queue';
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
} from './health';

export const PeerEventSchema = z.object({
  sourceAgent: z.string(),
  eventType: z.string(),
  payload: z.any(),
});
export type PeerEvent = z.infer<typeof PeerEventSchema>;

export abstract class BaseAgent<State extends PersistentAgentState = PersistentAgentState> extends Agent<Env, State> {
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
   * The name of this agent (e.g., 'GuardrailAgent')
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

  override async onStart(): Promise<void> {
    this.logger = new Logger(this.env as any, this.agentName);
    this.ai = new AIProvider(this.env as any);
    
    this.stateStore = new AgentStateStore<State>({
      ctx: this.ctx,
      env: this.env as any,
      agentName: this.agentName,
      initialState: this.initialState
    });

    this.hitl = new HitlQueue(this.env as any);

    // Initialize standard state tracking for all backend agents
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
   * SILOED COLLABORATION: 
   * Automatically resolves a peer agent assigned to the EXACT SAME session ID.
   * This guarantees that a GuardrailAgent for "Session-A" only talks to the EngineerAgent for "Session-A".
   */
  protected getPeerAgent<T>(binding: any): T {
    // this.name represents the current session ID
    if (!binding || typeof binding.idFromName !== 'function') {
      throw new Error(`Invalid binding provided to getPeerAgent for ${this.agentName}`);
    }
    const id = binding.idFromName(this.name);
    return binding.get(id) as unknown as T;
  }

  /**
   * Public RPC method allowing peer agents to send events into this agent's silo.
   */
  @callable()
  public async receivePeerEvent(event: PeerEvent): Promise<void> {
    const validated = PeerEventSchema.parse(event);
    
    // 1. Hot state log
    void this.sql`
      INSERT INTO peer_events_log (sourceAgent, eventType, payloadJson, timestamp)
      VALUES (${validated.sourceAgent}, ${validated.eventType}, ${JSON.stringify(validated.payload)}, ${new Date().toISOString()})
    `;

    // 2. Cold-path: D1 mirror (async, non-blocking)
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

    // 3. Trigger subclass logic
    await this.onPeerEvent(validated);
  }

  /**
   * Lifecycle hook to be overridden by subclasses (e.g., GuardrailAgent reacting to EngineerAgent).
   */
  protected async onPeerEvent(event: PeerEvent): Promise<void> {
    // Default no-op
    this.logger.info(`[onPeerEvent] Received event from ${event.sourceAgent}: ${event.eventType}; Full payload: ${JSON.stringify(event)}; Default no-op`);
  }

  /** Helper to gracefully close out background polling tasks. */
  @callable()
  public async gracefullyTerminateSession(): Promise<void> {
    const schedules = await this.getSchedules({ type: "interval" });
    for (const schedule of schedules) {
      this.ctx.waitUntil(this.cancelSchedule(schedule.id));
    }
    this.stateStore.patch({ status: "terminated", terminatedAt: new Date().toISOString() } as unknown as Partial<State>);
  }

  @callable()
  public async ping(): Promise<string> {
    return `pong from ${this.agentName}`;
  }

  // ── Layer 3 Extension Point ──────────────────────────────────────────

  /**
   * Override in subclasses to add domain-specific health checks (Layer 3).
   * These run AFTER the inherited base checks (B1–B7).
   * Return an empty array if no agent-specific checks are needed.
   */
  protected async agentHealthChecks(_mode: HealthMode): Promise<HealthCheck[]> {
    return [];
  }

  // ── Diagnostic Health Probe ──────────────────────────────────────────

  /**
   * Layered diagnostic health probe replacing the old trivial stub.
   *
   * Layer 2 (inherited): B1 binding sanity, B2 AI provider init,
   *   B3 state store round-trip, B4 skill reachability, B5 edigraph,
   *   B6 HITL queue dry-run, B7 collaboration binding resolution.
   * Layer 3 (per-agent): agentHealthChecks() override.
   *
   * @param opts.mode - 'fast' (cron, ≤2s, zero tokens) or 'deep' (user-triggered, ≤30s)
   */
  @callable()
  public async healthProbe(opts?: { mode?: HealthMode }): Promise<HealthReport> {
    const mode: HealthMode = opts?.mode ?? 'fast';
    const probeStart = Date.now();
    const timeoutMs = mode === 'fast' ? FAST_TIMEOUT_MS : DEEP_TIMEOUT_MS;

    // ── Assemble Layer 2 check factories ────────────────────────────
    const checkFns: HealthCheckFn[] = [
      // B1: Env binding sanity
      ...checkBindingSanity(this.env, ['DB', 'AI'], ['EDGRAPH', 'SKILLS_KV']),
      // B2: AIProvider initialization
      checkAIProviderInit(this.ai),
      // B3: State store round-trip
      checkStateStoreRoundTrip(this.stateStore, this.agentName, this.sql?.bind(this)),
      // B4: Skill manager reachability
      checkSkillManagerReachability(this.ai, this.skills ?? [], this.env),
      // B5: Edigraph connectivity (optional — skip if unbound)
      checkEdigraphConnectivity(this.env),
      // B6: HITL queue dry-run
      checkHitlQueueDryRun(this.env, this.agentName),
      // B7: Collaboration binding resolution
      ...checkCollabBindingResolution(this.env, this.peerAgentBindings, mode),
    ];

    // ── Run Layer 2 checks in parallel ──────────────────────────────
    const baseChecks = await runChecks(checkFns, { timeoutMs });

    // ── Run Layer 3 per-agent checks ────────────────────────────────
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
    const allChecks = [...baseChecks, ...agentChecks];
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
