/**
 * @file src/utils/honi-client.ts
 * @description Centralized HTTP client for all Honi Durable Object agents.
 *
 * ## Architecture Contract
 * Every Honi agent exposes a standard HTTP API served by the DO's `fetch()`:
 *   POST /chat             — Send a message; returns streaming or JSON
 *   GET  /history          — Thread history
 *   GET  /memory           — Agent memory state
 *   POST /reset            — Clear thread history
 *   POST /<custom>         — Agent-specific endpoints (e.g. /diagnose, /schedule/check)
 *
 * Thread isolation is enforced via the `x-thread-id` header. All methods
 * that accept a `threadId` inject this header automatically.
 *
 * ## Usage
 *
 * ```ts
 * import { HoniClient } from '@utils/honi-client';
 *
 * // Fetch an agent endpoint
 * const resp = await HoniClient.fetch(env.HEALTH_DIAGNOSTICIAN, 'singleton', '/diagnose', {
 *   method: 'POST',
 *   body: JSON.stringify(payload),
 * });
 *
 * // Proxy a WebSocket upgrade directly to the agent
 * return HoniClient.upgradeWebSocket(env.AGENT_SESSION_DO, sessionId, request);
 * ```
 *
 * ## Why This Exists
 * Eliminates raw `idFromName` / `.get()` / `.fetch()` anti-pattern.
 * All routes, services, and workflows MUST import from this module — never
 * construct stubs directly.
 *
 * @module utils/honi-client
 */

/** Minimal typing for a Cloudflare DurableObjectNamespace binding */
type DONamespace = {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
};

/** Options passed to HoniClient.fetch() */
export interface HoniFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | null;
  /** Thread isolation ID. Injected as `x-thread-id` header. */
  threadId?: string;
}

/** Options passed to HoniClient.chat() */
export interface HoniChatOptions {
  /** Thread isolation ID. Defaults to 'default'. */
  threadId?: string;
  /** Additional JSON body fields merged into the chat payload */
  extra?: Record<string, unknown>;
  /** Whether to stream the response via Server-Sent Events (SSE) */
  stream?: boolean;
}

/** Options passed to HoniClient.upgradeWebSocket() */
export interface HoniWebSocketOptions {
  /** Thread isolation ID. Injected as `x-thread-id` header. */
  threadId?: string;
}

/**
 * HoniClient — the single source of truth for calling Honi agents.
 *
 * All methods resolve the agent stub internally via `idFromName`.
 * Callers never touch the DO namespace directly.
 */
export const HoniClient = {
  /**
   * Resolves the DO stub for an agent without making a network call.
   * Use only when you need the raw stub for RPC method calls (rare — prefer `.fetch()`).
   *
   * @param binding  The DO namespace binding from `env`
   * @param name     The agent instance name (e.g. 'singleton', sessionId)
   */
  getStub(binding: DONamespace, name: string): DurableObjectStub {
    const id = binding.idFromName(name);
    return binding.get(id);
  },

  /**
   * Makes an HTTP request to a Honi agent endpoint.
   *
   * @param binding  The DO namespace binding from `env`
   * @param name     The agent instance name
   * @param path     The HTTP path (e.g. '/diagnose', '/chat', '/schedule/check')
   * @param options  Fetch options including optional threadId
   */
  async fetch(
    binding: DONamespace,
    name: string,
    path: string,
    options: HoniFetchOptions = {},
  ): Promise<Response> {
    const stub = HoniClient.getStub(binding, name);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (options.threadId) {
      headers['x-thread-id'] = options.threadId;
    }

    return stub.fetch(
      new Request(`http://agent${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body ?? undefined,
      }),
    );
  },

  /**
   * Sends a chat message to the agent's standard `/chat` endpoint.
   *
   * @param binding  The DO namespace binding from `env`
   * @param name     The agent instance name
   * @param message  The user message string
   * @param options  Optional threadId and extra body fields
   */
  async chat(
    binding: DONamespace,
    name: string,
    message: string,
    options: HoniChatOptions = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {};
    if (options.stream) {
      headers['Accept'] = 'text/event-stream';
    }

    return HoniClient.fetch(binding, name, '/chat', {
      method: 'POST',
      threadId: options.threadId,
      headers,
      body: JSON.stringify({ message, ...options.extra }),
    });
  },

  /**
   * Fetches the agent's thread history via `GET /history`.
   *
   * @param binding  The DO namespace binding from `env`
   * @param name     The agent instance name
   * @param threadId Optional thread isolation ID
   */
  async history(
    binding: DONamespace,
    name: string,
    threadId?: string,
  ): Promise<Response> {
    return HoniClient.fetch(binding, name, '/history', { threadId });
  },

  /**
   * Fetches the agent's memory state via `GET /memory`.
   *
   * @param binding  The DO namespace binding from `env`
   * @param name     The agent instance name
   */
  async memory(binding: DONamespace, name: string): Promise<Response> {
    return HoniClient.fetch(binding, name, '/memory');
  },

  /**
   * Resets the agent's thread history via `POST /reset`.
   *
   * @param binding  The DO namespace binding from `env`
   * @param name     The agent instance name
   * @param threadId Optional thread isolation ID
   */
  async reset(
    binding: DONamespace,
    name: string,
    threadId?: string,
  ): Promise<Response> {
    return HoniClient.fetch(binding, name, '/reset', {
      method: 'POST',
      threadId,
    });
  },

  /**
   * Forwards a WebSocket upgrade request directly to the agent DO.
   * The DO handles WS pairing internally via its `fetch()` handler.
   *
   * @param binding  The DO namespace binding from `env`
   * @param name     The agent instance name
   * @param request  The original incoming HTTP request (must include `Upgrade: websocket`)
   * @param wsPath   The path inside the DO to forward to (default: '/ws')
   */
  upgradeWebSocket(
    binding: DONamespace,
    name: string,
    request: Request,
    wsPath: string = '/ws',
  ): Promise<Response> {
    const stub = HoniClient.getStub(binding, name);
    return stub.fetch(
      new Request(`http://agent${wsPath}`, {
        headers: request.headers,
      }),
    );
  },

  /**
   * Health probe for a Honi agent. Calls `GET /health` and returns whether
   * the agent is reachable. Never throws — returns false on any error.
   *
   * @param binding  The DO namespace binding from `env`
   * @param name     The agent instance name (default 'health-check-probe')
   */
  async probe(binding: DONamespace, name: string = 'health-check-probe'): Promise<boolean> {
    try {
      const resp = await HoniClient.fetch(binding, name, '/health');
      return resp.ok;
    } catch {
      return false;
    }
  },
} as const;
