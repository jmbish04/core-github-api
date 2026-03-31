/**
 * @file backend/src/do/JulesWebhookBroadcaster.ts
 * @description Cloudflare Durable Object — WebSocket fan-out hub for Jules events.
 *
 * `JulesWebhookBroadcaster` is a singleton Durable Object that:
 *
 * 1. **Accepts WebSocket connections** from the frontend at
 *    `GET /api/webhooks/jules/ws`. Each connected browser tab receives
 *    all Jules events and progress updates in real time.
 *
 * 2. **Broadcasts events** from inbound webhook payloads posted by the
 *    Jules event and status route handlers. The routes call the DO via
 *    `POST /internal/broadcast` to fan out to all connected WebSocket clients.
 *
 * ## Authentication
 * WebSocket upgrades require a valid API key passed either as:
 *   - Query param `?apiKey=<key>`
 *   - Header `X-API-Key: <key>`
 * Checked against `AGENTIC_WORKER_API_KEY` and `WORKER_API_KEY` bindings.
 *
 * ## Project Tagging
 * Clients may pass `?projectId=<id>` to subscribe to a specific project's
 * events. The DO tags each WebSocket with `[projectId, 'system:all']` (or
 * just `['system:all']`). This survives hibernation via the CF Hibernatable
 * WebSockets API.
 *
 * ## Filtered Broadcast
 * When the broadcast payload includes a `projectId` field, events are sent
 * only to sockets tagged with that projectId plus `system:all` listeners.
 * Otherwise all sockets receive the event.
 *
 * ## Singleton Usage
 * Always address this DO by the fixed name `"jules-broadcaster"`:
 * ```ts
 * const id = env.JULES_WEBHOOK_BROADCASTER.idFromName("jules-broadcaster");
 * const broadcaster = env.JULES_WEBHOOK_BROADCASTER.get(id);
 * await broadcaster.fetch("http://internal/internal/broadcast", { method: "POST", body: JSON.stringify(message) });
 * ```
 *
 * @module DO/JulesWebhookBroadcaster
 */

import { DurableObject } from "cloudflare:workers";
import type { JulesLiveMessage } from "@services/jules";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolves a secret binding that may be either a plain string value or a
 * Cloudflare Secrets Store object with a `.get()` method.
 */
async function resolveSecret(binding: unknown): Promise<string | null> {
  if (!binding) return null;
  if (typeof binding === "string") return binding;
  if (typeof (binding as { get?: () => Promise<string> }).get === "function") {
    try {
      return await (binding as { get: () => Promise<string> }).get();
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Durable Object that maintains WebSocket connections and broadcasts
 * Jules webhook events to all subscribed frontend clients.
 */
export class JulesWebhookBroadcaster extends DurableObject<Env> {
  /**
   * Handles all incoming HTTP requests to this Durable Object.
   *
   * Routes:
   *   - `GET /ws`                → Upgrades to a WebSocket client connection
   *   - `POST /internal/broadcast` → Broadcasts a JulesLiveMessage to all clients
   *
   * @param request - Incoming HTTP request.
   * @returns HTTP response (101 Upgrade or 200/400).
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws" && request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocketUpgrade(request);
    }

    if (url.pathname === "/internal/broadcast" && request.method === "POST") {
      return this.handleBroadcast(request);
    }

    return new Response("Not found", { status: 404 });
  }

  /**
   * Upgrades an incoming HTTP request to a WebSocket connection.
   *
   * Validates API key from `?apiKey=` query param or `X-API-Key` header.
   * Tags the socket with `[projectId, 'system:all']` if `?projectId=` is set,
   * otherwise `['system:all']`.
   *
   * @param request - The request with `Upgrade: websocket` header.
   * @returns 101 Switching Protocols or 401 Unauthorized.
   */
  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // --- Auth ---
    const providedKey =
      url.searchParams.get("apiKey") ||
      request.headers.get("X-API-Key");

    if (providedKey) {
      const [agentKey, workerKey] = await Promise.all([
        resolveSecret(this.env.AGENTIC_WORKER_API_KEY),
        resolveSecret(this.env.WORKER_API_KEY),
      ]);

      const validKeys = [agentKey, workerKey].filter(Boolean) as string[];
      if (validKeys.length > 0 && !validKeys.includes(providedKey)) {
        return new Response("Unauthorized", { status: 401 });
      }
    } else {
      // No key provided — reject if secrets are configured
      const [agentKey, workerKey] = await Promise.all([
        resolveSecret(this.env.AGENTIC_WORKER_API_KEY),
        resolveSecret(this.env.WORKER_API_KEY),
      ]);
      if (agentKey || workerKey) {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    // --- Project tagging ---
    const projectId = url.searchParams.get("projectId");
    const tags: string[] = projectId ? [projectId, "system:all"] : ["system:all"];

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    // Accept with hibernation + tags
    this.ctx.acceptWebSocket(server, tags);

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Broadcast handler — called by the Jules webhook route handlers when
   * Jules posts an event or status update. Deserializes the payload and
   * sends it to the appropriate connected WebSocket clients.
   *
   * If the payload contains a `projectId`, sends to sockets tagged with
   * that projectId plus `system:all`. Otherwise sends to all sockets.
   *
   * @param request - POST request with a JSON `JulesLiveMessage` body.
   * @returns 200 OK with a count of clients notified.
   */
  private async handleBroadcast(request: Request): Promise<Response> {
    let message: JulesLiveMessage & { projectId?: string };
    try {
      message = (await request.json()) as JulesLiveMessage & { projectId?: string };
    } catch {
      return new Response("Invalid JSON body", { status: 400 });
    }

    const payload = JSON.stringify(message);
    let clients: WebSocket[];

    if (message.projectId) {
      // Fan out to project subscribers + all-channel listeners, deduped
      const projectSockets = this.ctx.getWebSockets(message.projectId);
      const allSockets = this.ctx.getWebSockets("system:all");
      const seen = new Set<WebSocket>();
      clients = [];
      for (const ws of [...projectSockets, ...allSockets]) {
        if (!seen.has(ws)) {
          seen.add(ws);
          clients.push(ws);
        }
      }
    } else {
      clients = this.ctx.getWebSockets();
    }

    let sent = 0;
    for (const ws of clients) {
      try {
        ws.send(payload);
        sent++;
      } catch {
        // Client already closed — it will be cleaned up by webSocketClose/webSocketError
      }
    }

    return new Response(JSON.stringify({ ok: true, clients: sent }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Hibernatable WebSocket lifecycle ────────────────────────────────────────

  /**
   * Called when a client sends a message.
   * Handles `{"type":"ping"}` → responds with `{"type":"pong","timestamp":...}`.
   *
   * @param ws - The WebSocket that sent the message.
   * @param message - The raw message string or ArrayBuffer.
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      const text = typeof message === "string" ? message : new TextDecoder().decode(message);
      const parsed = JSON.parse(text) as { type?: string };
      if (parsed?.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
      }
    } catch {
      // Non-JSON messages are silently ignored
    }
  }

  /**
   * Called when a WebSocket client closes its connection.
   * The Durable Object automatically removes the WebSocket from its set.
   */
  async webSocketClose(
    _ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean
  ): Promise<void> {
    // No-op: CF runtime removes the WebSocket from getWebSockets() automatically
  }

  /**
   * Called when a WebSocket encounters an error.
   * The Durable Object automatically removes the WebSocket from its set.
   */
  async webSocketError(_ws: WebSocket, _error: unknown): Promise<void> {
    // No-op: CF runtime cleans up errored WebSockets automatically
  }
}
