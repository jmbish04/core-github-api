/**
 * @file src/ai/providers/agent-support/base-chat-agent.ts
 * @description BaseChatAgent for chat-oriented agents with dynamic skill extraction
 */
import { AIChatAgent } from 'agents/ai-chat-agent';
import { callable } from 'agents';
import { AIProvider } from '@/ai/providers';
import { AgentStateStore } from './state-store';
import { Logger } from '@/lib/logger';
import { HitlQueue } from './hitl-queue';
import { PeerEventSchema, type PeerEvent } from './base-agent';
import type { PersistentAgentState } from './types';

export abstract class BaseChatAgent<State extends PersistentAgentState = PersistentAgentState> extends AIChatAgent<Env, State> {
  protected ai!: AIProvider;
  protected stateStore!: AgentStateStore<State>;
  protected logger!: Logger;
  protected hitl!: HitlQueue;
  
  /**
   * Static skills configured for the agent class.
   */
  protected abstract get skills(): string[];

  /**
   * The name of this agent (e.g., 'AssistantAgent')
   */
  protected abstract get agentName(): string;

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
    this.sql`
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
    this._requestSkills = [];
    if (this.ai && this.ai.skills) {
      this._requestSkills = this.ai.skills.extractHeaders(request);
    }
    return super.onRequest(request);
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
    
    this.sql`
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
  protected async onPeerEvent(event: PeerEvent): Promise<void> {
    // Override in subclass (e.g. EngineerAgent reacting to Guardrail feedback)
  }

  // To maintain compatibility with AIChatAgent, onChatMessage should be implemented by subclasses
  // or overridden here if AIChatAgent requires it.
  
  @callable()
  public async healthProbe() {
    return {
      status: "healthy",
      agent: this.agentName,
      capabilities: [
        `skills_configured:${this.skills ? this.skills.length : 0}`,
        `isFrontendFacing:true`
      ]
    };
  }
}
