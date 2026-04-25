/**
 * @file ai/providers/agent-support/base-think-agent.ts
 * @description BaseThinkAgent — V8 Think pilot base class.
 *
 * This is a PEER to BaseChatAgent, NOT a replacement. It extends `Think`
 * from `@cloudflare/think` and mirrors the service surface of BaseAgent:
 *   - Protected: logger, stateStore, hitl, peerEventsLog
 *   - Public accessors: getEnv/getAI/getLogger/getStateStore/getSkills/getAgentName
 *   - @callable: streamEvents, receivePeerEvent, healthProbe, ping
 *   - Layer 3: agentHealthChecks() override point
 *
 * INVARIANTS:
 *   1. This is the v8 Think pilot — @callable surface is APPEND-ONLY.
 *   2. chatRecovery is intentionally false pending HITL × fiber characterization.
 *   3. BaseChatAgent is NOT modified or replaced by this class.
 *
 * @see docs/new_agents_sdk/think.md
 * @see V8-04 in TASKS.json
 */

import { Think, type Session } from '@cloudflare/think';
import { callable, StreamingResponse } from 'agents';
import { AIProvider } from '@/ai/providers';
import { AgentStateStore } from './state-store';
import { Logger } from '@/lib/logger';
import { HitlQueue } from './hitl-queue';
import { PeerEventSchema, type PeerEvent } from './base-agent';
import type { PersistentAgentState } from './types';
import { SkillManager } from './skills';
import { SkillManagerSkillProvider } from './skill-provider';
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
import { captureRecentEvents } from './health/metrics-tap';

/**
 * BaseThinkAgent extends `Think` from `@cloudflare/think` and provides
 * the same service surface as `BaseAgent` (parity with the non-chat backend
 * agent base class). Agents that benefit from Think's opinionated agentic
 * loop, context blocks, and workspace tools should extend this class.
 *
 * Think handles: WebSocket chat protocol, message persistence, agentic loop,
 * stream resumption, workspace file tools, and context management.
 *
 * @example
 * ```ts
 * export class WorkshopAgent extends BaseThinkAgent<WorkshopState> {
 *   protected get agentName() { return 'WorkshopAgent'; }
 *   protected get skills() { return ['planning', 'spec-writing']; }
 *   async agentInit() { /* custom init * / }
 *   getModel() { return createWorkersAI({ binding: this.env.AI })('@cf/...'); }
 * }
 * ```
 */
export abstract class BaseThinkAgent<
  State extends PersistentAgentState = PersistentAgentState,
> extends Think<Env> {
  protected ai!: AIProvider;
  protected stateStore!: AgentStateStore<State>;
  protected logger!: Logger;
  protected hitl!: HitlQueue;
  protected skillManager!: SkillManager;
  protected streamController: ReadableStreamDefaultController | null = null;
  /** Active @callable streaming consumers keyed by channel name. */
  private _streamConsumers = new Map<string, StreamingResponse>();

  // ── Think Configuration ──────────────────────────────────────────────

  /**
   * Disable chatRecovery (fiber-based durable execution).
   * Intentionally false pending HITL × fiber characterization.
   */
  override chatRecovery = false as const;

  // ── Abstract Contract ────────────────────────────────────────────────

  /** Static skills configured for the agent class. */
  protected abstract get skills(): string[];

  /** The name of this agent (e.g., 'WorkshopAgent') */
  protected abstract get agentName(): string;

  /**
   * Peer agent bindings this agent depends on for collaboration.
   * Override in subclasses to declare required/optional peers.
   */
  protected get peerAgentBindings(): Record<string, PeerBindingDescriptor> {
    return {};
  }

  // ── Public Accessors ──────────────────────────────────────────────────

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
   * Lifecycle method to initialize agent-specific resources.
   * Runs before skill warming.
   */
  protected abstract agentInit(): Promise<void>;

  // ── Think Lifecycle ──────────────────────────────────────────────────

  override async onStart(): Promise<void> {
    await super.onStart(); // Required for Think behavior

    this.logger = new Logger(this.env as any, this.agentName);
    this.ai = new AIProvider(this.env as any);

    this.stateStore = new AgentStateStore<State>({
      ctx: this.ctx,
      env: this.env as any,
      agentName: this.agentName,
      initialState: {} as State,
    });

    this.hitl = new HitlQueue(this.env as any);
    this.skillManager = new SkillManager(this.env as any);

    // Initialize standard state tracking for peer events
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
        this.skillManager.prefetch(configuredSkills).catch(error => {
          this.logger.warn("Failed to warm skill cache during onStart", { error });
        })
      );
    }
  }

  // ── Think Session Configuration ──────────────────────────────────────

  override configureSession(session: Session) {
    const provider = new SkillManagerSkillProvider(this.skillManager, this.env);
    return session.withContext("skills", {
      provider,
      description: "Available skills and their contents",
    });
  }

  // ── @callable SSE Streaming ──────────────────────────────────────────

  /**
   * Open a named SSE channel via the Agents SDK streaming RPC.
   */
  @callable({ streaming: true })
  public streamEvents(stream: StreamingResponse, channel = 'default'): void {
    this._streamConsumers.set(channel, stream);
    stream.send({ type: 'connected', channel, agent: this.agentName, timestamp: Date.now() });
  }

  /**
   * Emit a structured event to ALL connected streaming consumers.
   */
  protected emitStreamEvent(data: Record<string, unknown>, channel = 'default'): void {
    // Legacy ReadableStream path
    if (this.streamController) {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      try {
        this.streamController.enqueue(new TextEncoder().encode(`data: ${payload}\n\n`));
      } catch { /* already closed */ }
    }

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

  // ── Peer Collaboration ───────────────────────────────────────────────

  /**
   * SILOED COLLABORATION:
   * Resolves a peer agent assigned to the EXACT SAME session ID.
   */
  protected getPeerAgent<T>(binding: any): T {
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

    // Hot state log
    void this.sql`
      INSERT INTO peer_events_log (sourceAgent, eventType, payloadJson, timestamp)
      VALUES (${validated.sourceAgent}, ${validated.eventType}, ${JSON.stringify(validated.payload)}, ${new Date().toISOString()})
    `;

    // Cold-path: D1 mirror
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

    await this.onPeerEvent(validated);
  }

  /**
   * Lifecycle hook to be overridden by subclasses.
   */
  protected async onPeerEvent(event: PeerEvent): Promise<void> {
    this.logger.info(`[onPeerEvent] Received event from ${event.sourceAgent}: ${event.eventType}`);
  }

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
   */
  protected async agentHealthChecks(_mode: HealthMode): Promise<HealthCheck[]> {
    return [];
  }

  // ── Diagnostic Health Probe ──────────────────────────────────────────

  @callable()
  public async healthProbe(opts?: { mode?: HealthMode }): Promise<HealthReport> {
    const mode: HealthMode = opts?.mode ?? 'fast';
    const probeStart = Date.now();
    const timeoutMs = mode === 'fast' ? FAST_TIMEOUT_MS : DEEP_TIMEOUT_MS;

    const checkFns: HealthCheckFn[] = [
      ...checkBindingSanity(this.env, ['DB', 'AI'], ['EDGRAPH', 'SKILLS_KV']),
      checkAIProviderInit(this.ai),
      checkStateStoreRoundTrip(this.stateStore, this.agentName, this.sql?.bind(this)),
      checkSkillManagerReachability(this.ai, this.skills ?? [], this.env),
      checkEdigraphConnectivity(this.env),
      checkHitlQueueDryRun(this.env, this.agentName),
      ...checkCollabBindingResolution(this.env, this.peerAgentBindings, mode),
    ];

    const baseChecks = await runChecks(checkFns, { timeoutMs });

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

    const allChecks = [...baseChecks, ...agentChecks];
    const status = aggregateStatus(allChecks);
    const summary = buildSummary(allChecks);
    const { recentRpcErrors, recentMcpEvents } = captureRecentEvents();

    return {
      agent: this.agentName,
      status,
      mode,
      durationMs: Date.now() - probeStart,
      timestamp: new Date().toISOString(),
      checks: allChecks,
      summary,
      recentRpcErrors,
      recentMcpEvents,
    };
  }
}
