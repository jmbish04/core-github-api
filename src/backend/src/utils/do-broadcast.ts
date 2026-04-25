/**
 * @file src/utils/do-broadcast.ts
 * @description Centralized client for WebSocket broadcaster Durable Objects.
 *
 * ## Architecture Contract
 * WebSocket broadcaster DOs are NOT Agents SDK agents and NOT Sandbox containers.
 * They are singleton stateful hubs that:
 *   1. Accept `POST /internal/broadcast` to fan out a JSON payload to all connected WS clients
 *   2. Accept `GET /ws` (Upgrade: websocket) to onboard a new client
 *
 * These DOs are always referenced by a fixed name (e.g. 'jules-broadcaster', 'global').
 * This module provides the single access point for all broadcast interactions.
 *
 * ## Usage
 *
 * ```ts
 * import { BroadcastClient } from '@utils/do-broadcast';
 *
 * // Broadcast a message
 * await BroadcastClient.broadcast(env.JULES_WEBHOOK_BROADCASTER, 'jules-broadcaster', message);
 *
 * // Forward a WebSocket upgrade
 * return BroadcastClient.upgradeWebSocket(env.JULES_WEBHOOK_BROADCASTER, 'jules-broadcaster', request);
 * ```
 *
 * @module utils/do-broadcast
 */

/** Minimal typing for a Cloudflare DurableObjectNamespace binding */
type DONamespace = {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
};

/**
 * BroadcastClient — the single source of truth for interacting with WebSocket broadcaster DOs.
 *
 * All methods resolve the DO stub internally via `idFromName`.
 * Callers never touch the DO namespace directly.
 */
export const BroadcastClient = {
  /**
   * Resolves the DO stub for a broadcaster without making a network call.
   * Internal use only — prefer `.broadcast()` or `.upgradeWebSocket()`.
   */
  getStub(binding: DONamespace, name: string): DurableObjectStub {
    const id = binding.idFromName(name);
    return binding.get(id);
  },

  /**
   * Broadcasts a serializable payload to all connected WebSocket clients
   * via `POST /internal/broadcast` on the broadcaster DO.
   *
   * Errors are swallowed and logged — broadcast failures must never crash the caller.
   *
   * @param binding  The DO namespace binding from `env`
   * @param name     The singleton instance name (e.g. 'jules-broadcaster', 'global')
   * @param payload  The message payload to broadcast. Must be JSON-serializable.
   */
  async broadcast(
    binding: DONamespace,
    name: string,
    payload: unknown,
  ): Promise<void> {
    try {
      const stub = BroadcastClient.getStub(binding, name);
      await stub.fetch(
        new Request('http://internal/internal/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
      );
    } catch (err) {
      console.error(`[BroadcastClient] broadcast to "${name}" failed:`, err);
    }
  },

  /**
   * Forwards a WebSocket upgrade request to the broadcaster DO so the
   * browser can maintain a persistent connection to the singleton.
   *
   * @param binding  The DO namespace binding from `env`
   * @param name     The singleton instance name
   * @param request  The original incoming HTTP request (must have `Upgrade: websocket`)
   * @param wsPath   The internal path to forward to (default: '/ws')
   */
  upgradeWebSocket(
    binding: DONamespace,
    name: string,
    request: Request,
    wsPath: string = '/ws',
  ): Promise<Response> {
    const stub = BroadcastClient.getStub(binding, name);
    return stub.fetch(
      new Request(`http://internal${wsPath}`, {
        headers: request.headers,
      }),
    );
  },
} as const;
