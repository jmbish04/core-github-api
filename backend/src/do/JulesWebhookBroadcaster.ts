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
 * ## Singleton Usage
 * Always address this DO by the fixed name `"jules-broadcaster"`:
 * ```ts
 * const id = env.JULES_WEBHOOK_BROADCASTER.idFromName("jules-broadcaster");
 * const broadcaster = env.JULES_WEBHOOK_BROADCASTER.get(id);
 * await broadcaster.fetch("http://internal/internal/broadcast", { method: "POST", body: JSON.stringify(message) });
 * ```
 *
 * ## Client Management
 * Connected WebSocket clients are tracked in memory. Clients that close or
 * error are removed automatically. The DO uses the Cloudflare Hibernatable
 * WebSockets API so idle connections do not count against CPU time.
 *
 * @module DO/JulesWebhookBroadcaster
 */

import { DurableObject } from "cloudflare:workers";
import type { JulesLiveMessage } from "@/services/jules/types";

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
   * The new client is added to the hibernatable WebSocket set and will
   * receive all future broadcast messages.
   *
   * Uses CF Hibernatable WebSockets so idle clients do not consume CPU time.
   *
   * @param request - The request with `Upgrade: websocket` header.
   * @returns 101 Switching Protocols response.
   */
  private handleWebSocketUpgrade(request: Request): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    // Accept the server side with hibernation support
    this.ctx.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Broadcast handler — called by the Jules webhook route handlers when
   * Jules posts an event or status update. Deserializes the payload and
   * sends it to every currently connected WebSocket client.
   *
   * Clients that have disconnected are silently skipped.
   *
   * @param request - POST request with a JSON `JulesLiveMessage` body.
   * @returns 200 OK with a count of clients notified.
   */
  private async handleBroadcast(request: Request): Promise<Response> {
    let message: JulesLiveMessage;
    try {
      message = (await request.json()) as JulesLiveMessage;
    } catch {
      return new Response("Invalid JSON body", { status: 400 });
    }

    const payload = JSON.stringify(message);
    const clients = this.ctx.getWebSockets();
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
   * Called when a client sends a message. The frontend does not currently
   * send upstream messages, but this is here for future extensibility
   * (e.g. subscribing to specific session IDs).
   *
   * @param _ws - The WebSocket that sent the message.
   * @param _message - The raw message string or ArrayBuffer.
   */
  async webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer): Promise<void> {
    // Reserved for future upstream messaging (e.g. session-specific subscriptions)
  }

  /**
   * Called when a WebSocket client closes its connection.
   * The Durable Object automatically removes the WebSocket from its set.
   *
   * @param _ws - The WebSocket that closed.
   * @param _code - WebSocket close code.
   * @param _reason - Close reason string.
   * @param _wasClean - Whether the close was clean.
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
   *
   * @param _ws - The WebSocket that errored.
   * @param _error - The error that occurred.
   */
  async webSocketError(_ws: WebSocket, _error: unknown): Promise<void> {
    // No-op: CF runtime cleans up errored WebSockets automatically
  }
}
