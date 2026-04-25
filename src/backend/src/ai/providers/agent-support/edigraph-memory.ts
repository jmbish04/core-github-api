/**
 * Edigraph Memory Service
 *
 * Provides a strongly-typed, session-partitioned interface to the standalone
 * Edigraph worker for episodic, semantic, and graph memory operations.
 *
 * The service communicates over a Cloudflare Service Binding (`env.EDGRAPH`,
 * typed as `Fetcher`) and is designed to be instantiated inside the `onStart`
 * or `onMessage` lifecycle of a Cloudflare `Agent` or `AIChatAgent`.
 *
 * @example
 * ```ts
 * // Inside an AIChatAgent:
 * import { EdigraphService } from '@/ai/agents/support/edigraph-memory';
 *
 * class MyAgent extends AIChatAgent<Env> {
 *   private memory!: EdigraphService;
 *
 *   async onStart() {
 *     this.memory = new EdigraphService(this.env.EDGRAPH, this.id.toString());
 *   }
 *
 *   async onMessage(message: any) {
 *     // Non-blocking save — doesn't delay the LLM response stream
 *     this.ctx.waitUntil(this.memory.addEpisodic(message.content, { role: 'user' }));
 *
 *     // Blocking search — results inform the system prompt
 *     const context = await this.memory.searchSemantic(message.content);
 *     const graphCtx = await this.memory.getContext(['user', 'project']);
 *   }
 * }
 * ```
 *
 * @module AI/Agents/Support/EdigraphMemory
 */

// ---------------------------------------------------------------------------
// Shared Return Types
// ---------------------------------------------------------------------------

/** A single episodic memory entry returned from the Edigraph worker. */
export interface EpisodicMemoryEntry {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  score?: number;
}

/** A single semantic memory entry with vector similarity score. */
export interface SemanticMemoryEntry {
  id: string;
  fact: string;
  metadata: Record<string, unknown>;
  score: number;
}

/** A node in the knowledge graph. */
export interface GraphNode {
  id: string;
  label: string;
  properties: Record<string, unknown>;
}

/** An edge (relationship) in the knowledge graph. */
export interface GraphEdge {
  source: string;
  relation: string;
  target: string;
  properties?: Record<string, unknown>;
}

/** The topological context returned for a set of entities. */
export interface GraphContext {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ---------------------------------------------------------------------------
// RPC Interface — mirrors the Edigraph standalone worker's public surface
// ---------------------------------------------------------------------------

/**
 * Type definitions for the Edigraph standalone worker's RPC methods.
 *
 * The standalone worker (`core-github-api-edgraph`) exposes these methods
 * via Cloudflare Service Binding RPC. Each method accepts an `agentId`
 * as its first parameter to partition data per agent/session.
 */
export interface EdigraphRPC {
  // Episodic Memory
  saveEpisodic(agentId: string, content: string, metadata?: Record<string, unknown>): Promise<void>;
  searchEpisodic(agentId: string, query: string, limit?: number): Promise<EpisodicMemoryEntry[]>;

  // Semantic Memory
  saveSemantic(agentId: string, fact: string, metadata?: Record<string, unknown>): Promise<void>;
  searchSemantic(agentId: string, query: string, limit?: number): Promise<SemanticMemoryEntry[]>;

  // Graph Memory
  addGraphEdge(
    agentId: string,
    source: string,
    relation: string,
    target: string,
    properties?: Record<string, unknown>,
  ): Promise<void>;
  getGraphContext(agentId: string, entities: string[], depth?: number): Promise<GraphContext>;
}

// ---------------------------------------------------------------------------
// Service Implementation
// ---------------------------------------------------------------------------

/**
 * Session-partitioned client for the Edigraph memory worker.
 *
 * Every method is automatically scoped to the `agentId` supplied at
 * construction. All mutations are fire-and-forget safe — errors are caught
 * and logged instead of thrown, making them ideal for `ctx.waitUntil()`.
 *
 * ### Non-Blocking Writes via `ctx.waitUntil()`
 *
 * Memory writes should almost never block the LLM response stream. Inside
 * an Agent's `onMessage` or `onRequest`, wrap write calls:
 *
 * ```ts
 * this.ctx.waitUntil(this.memory.addEpisodic(content, metadata));
 * this.ctx.waitUntil(this.memory.addRelation('user', 'ASKED_ABOUT', 'topic'));
 * ```
 *
 * The Durable Object's `ctx.waitUntil()` keeps the isolate alive until the
 * promise settles, but returns control immediately to the caller.
 *
 * ### Blocking Reads for Context Injection
 *
 * Search methods should be `await`-ed when their results feed into the
 * system prompt or tool selection:
 *
 * ```ts
 * const memories = await this.memory.searchSemantic(query);
 * const graph = await this.memory.getContext(['ProjectX', 'user-123']);
 * ```
 */
export class EdigraphService {
  private readonly rpc: EdigraphRPC;
  private readonly agentId: string;

  /**
   * @param rpcBinding - The Cloudflare Service Binding for the Edigraph worker
   *                     (i.e. `this.env.EDGRAPH`). Typed as `Fetcher` in the
   *                     generated `Env` interface, then cast to `EdigraphRPC`
   *                     for type-safe RPC invocation.
   * @param agentId    - A unique partition key for this agent instance.
   *                     Use `this.id.toString()` from the Agents SDK to scope
   *                     all memory to the current Durable Object instance.
   */
  constructor(rpcBinding: Fetcher, agentId: string) {
    this.rpc = rpcBinding as unknown as EdigraphRPC;
    this.agentId = agentId;
  }

  /** Returns the partition key this service is scoped to. */
  get partitionId(): string {
    return this.agentId;
  }

  // ─── EPISODIC MEMORY ────────────────────────────────────────────────────
  // Captures conversational event streams (user messages, tool calls, etc.)

  /**
   * Persist an episodic memory entry.
   *
   * Best used with `ctx.waitUntil()` for non-blocking saves.
   *
   * @param content  - The raw content/event to store.
   * @param metadata - Optional key-value metadata (role, timestamp, etc.).
   */
  async addEpisodic(content: string, metadata?: Record<string, unknown>): Promise<void> {
    try {
      await this.rpc.saveEpisodic(this.agentId, content, metadata);
    } catch (error) {
      console.error(`[EdigraphService:${this.agentId}] addEpisodic failed:`, error);
    }
  }

  /**
   * Search episodic memory by semantic similarity.
   *
   * Should be `await`-ed when results inform the system prompt.
   *
   * @param query - Natural language query to match against stored episodes.
   * @param limit - Maximum number of results (default: 5).
   * @returns Matching entries sorted by relevance, or `[]` on failure.
   */
  async searchEpisodic(query: string, limit = 5): Promise<EpisodicMemoryEntry[]> {
    try {
      return await this.rpc.searchEpisodic(this.agentId, query, limit);
    } catch (error) {
      console.error(`[EdigraphService:${this.agentId}] searchEpisodic failed:`, error);
      return [];
    }
  }

  // ─── SEMANTIC MEMORY ────────────────────────────────────────────────────
  // Stores vectorized facts, rules, and user preferences.

  /**
   * Persist a semantic fact or rule.
   *
   * The Edigraph worker will embed and index the fact for vector search.
   * Best used with `ctx.waitUntil()` for non-blocking saves.
   *
   * @param fact     - The factual statement to persist.
   * @param metadata - Optional structured metadata (source, confidence, etc.).
   */
  async addSemantic(fact: string, metadata?: Record<string, unknown>): Promise<void> {
    try {
      await this.rpc.saveSemantic(this.agentId, fact, metadata);
    } catch (error) {
      console.error(`[EdigraphService:${this.agentId}] addSemantic failed:`, error);
    }
  }

  /**
   * Search semantic memory by vector similarity.
   *
   * Should be `await`-ed when results inform the system prompt.
   *
   * @param query - Natural language query to match against stored facts.
   * @param limit - Maximum number of results (default: 3).
   * @returns Matching entries sorted by score, or `[]` on failure.
   */
  async searchSemantic(query: string, limit = 3): Promise<SemanticMemoryEntry[]> {
    try {
      return await this.rpc.searchSemantic(this.agentId, query, limit);
    } catch (error) {
      console.error(`[EdigraphService:${this.agentId}] searchSemantic failed:`, error);
      return [];
    }
  }

  // ─── GRAPH MEMORY ──────────────────────────────────────────────────────
  // Manages entity relationships in a directed knowledge graph.

  /**
   * Add a directed edge (relationship) between two entities.
   *
   * Best used with `ctx.waitUntil()` for non-blocking saves.
   *
   * @param source     - The source entity identifier.
   * @param relation   - The relationship type (e.g. `OWNS`, `DEPENDS_ON`).
   * @param target     - The target entity identifier.
   * @param properties - Optional edge-level properties.
   */
  async addRelation(
    source: string,
    relation: string,
    target: string,
    properties?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.rpc.addGraphEdge(this.agentId, source, relation, target, properties);
    } catch (error) {
      console.error(`[EdigraphService:${this.agentId}] addRelation failed:`, error);
    }
  }

  /**
   * Retrieve the topological context (nodes + edges) surrounding a set of
   * entities. Useful for building graph-aware system prompts.
   *
   * Should be `await`-ed when results feed into the LLM context window.
   *
   * @param entities - Entity identifiers to center the traversal on.
   * @param depth    - How many hops to traverse from each entity (default: 2).
   * @returns The subgraph context, or `null` on failure.
   */
  async getContext(entities: string[], depth = 2): Promise<GraphContext | null> {
    try {
      return await this.rpc.getGraphContext(this.agentId, entities, depth);
    } catch (error) {
      console.error(`[EdigraphService:${this.agentId}] getContext failed:`, error);
      return null;
    }
  }

  // ─── BATCH / CONVENIENCE HELPERS ────────────────────────────────────────

  /**
   * Convenience helper that saves a full conversation turn (user + assistant)
   * as episodic memory in a single fire-and-forget call.
   *
   * Designed to be wrapped in `ctx.waitUntil()`:
   * ```ts
   * this.ctx.waitUntil(this.memory.saveConversationTurn(userMsg, assistantMsg, { model }));
   * ```
   *
   * @param userMessage      - The user's message content.
   * @param assistantMessage - The assistant's response content.
   * @param metadata         - Shared metadata applied to both entries.
   */
  async saveConversationTurn(
    userMessage: string,
    assistantMessage: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    await Promise.allSettled([
      this.addEpisodic(userMessage, { ...metadata, role: 'user', timestamp }),
      this.addEpisodic(assistantMessage, { ...metadata, role: 'assistant', timestamp }),
    ]);
  }

  /**
   * Retrieve a combined context object from all three memory tiers.
   *
   * Runs episodic, semantic, and graph queries in parallel and returns
   * a unified result. Ideal for building a comprehensive system prompt.
   *
   * @param query    - Query string for episodic and semantic search.
   * @param entities - Entity identifiers for graph context traversal.
   * @param limits   - Per-tier result limits.
   */
  async getFullContext(
    query: string,
    entities: string[] = [],
    limits?: { episodic?: number; semantic?: number; graphDepth?: number },
  ): Promise<{
    episodic: EpisodicMemoryEntry[];
    semantic: SemanticMemoryEntry[];
    graph: GraphContext | null;
  }> {
    const [episodic, semantic, graph] = await Promise.all([
      this.searchEpisodic(query, limits?.episodic ?? 5),
      this.searchSemantic(query, limits?.semantic ?? 3),
      entities.length > 0
        ? this.getContext(entities, limits?.graphDepth ?? 2)
        : Promise.resolve(null),
    ]);

    return { episodic, semantic, graph };
  }
}