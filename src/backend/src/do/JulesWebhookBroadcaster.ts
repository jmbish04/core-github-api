/**
 * @file backend/src/do/JulesWebhookBroadcaster.ts
 * @description Cloudflare Agents SDK — WebSocket fan-out hub for Jules events.
 *
 * @deprecated Migrate to the **AgenticSession** service (`@/services/agentic-session`).
 * Every Jules webhook is now also published as a `jules.status` / `jules.event`
 * SessionEvent into a per-session AgenticSession DO; per-session viewers should
 * use `useAgenticSession(sessionId, { filter: { types: ['jules.status', 'jules.event'] } })`
 * on the frontend. This DO is retained for one release cycle to keep the global
 * `<JulesLiveProvider>` toast feed working without a breaking UX change.
 *
 * See [docs/gh_research_feature/PHASE-3-TYPECHECK-FIXES.md] for the migration plan.
 *
 * `JulesWebhookBroadcaster` is a singleton Agent that:
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
 * Handled defense-in-depth: At the Hono edge layer and inside `onConnect`.
 *
 * ## Project Tagging
 * Clients may pass `?projectId=<id>` to subscribe to a specific project's
 * events. The DO tags each WebSocket with `[projectId, 'system:all']` (or
 * just `['system:all']`).
 *
 * ## Filtered Broadcast
 * When the broadcast payload includes a `projectId` field, events are sent
 * only to sockets tagged with that projectId plus `system:all` listeners.
 * Otherwise all sockets receive the event.
 *
 * ## Singleton Usage
 * Always address this Agent by the fixed name `"jules-broadcaster"`:
 * ```ts
 * const agent = await getAgentByName(env.JULES_WEBHOOK_BROADCASTER, "jules-broadcaster");
 * await agent.fetch(new Request("http://internal/internal/broadcast", { method: "POST", body: JSON.stringify(message) }));
 * ```
 *
 * @module DO/JulesWebhookBroadcaster
 */

import { Agent, callable } from "agents";
import type { Connection, ConnectionContext, WSMessage } from "agents";
import type { JulesLiveMessage } from "@/services/jules/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { Logger } from "@/lib/logger";
import { getSecret } from '@/utils/secrets';

/**
 * Agent that maintains WebSocket connections and broadcasts
 * Jules webhook events to all subscribed frontend clients.
 */
export class JulesWebhookBroadcaster extends Agent<Env> {
  
  /**
   * Prevents the Agent SDK from sending protocol frames like `cf_agent_identity`.
   * The frontend expects raw JSON strings matching `JulesLiveMessage`.
   */
  shouldSendProtocolMessages(_connection: Connection, _ctx: ConnectionContext): boolean {
    return false;
  }

  /**
   * Tags the connection with the project ID if provided, allowing filtered broadcasts.
   */
  getConnectionTags(connection: Connection, ctx: ConnectionContext): string[] {
    const url = new URL(ctx.request.url);
    const projectId = url.searchParams.get("projectId");
    return projectId ? [projectId, "system:all"] : ["system:all"];
  }

  /**
   * Called when a new WebSocket upgrades. Defense-in-depth auth check.
   */
  async onConnect(connection: Connection, ctx: ConnectionContext): Promise<void> {
    const url = new URL(ctx.request.url);
    const logger = new Logger(this.env, "JulesWebhookBroadcaster");

    const providedKey = url.searchParams.get("apiKey") || ctx.request.headers.get("X-API-Key");
    const [agentKey, workerKey] = await Promise.all([
      getSecret(this.env, "AGENTIC_WORKER_API_KEY"),
      getSecret(this.env, "WORKER_API_KEY"),
    ]);
    
    const validKeys = [agentKey, workerKey].filter(Boolean) as string[];
    
    if (validKeys.length > 0 && (!providedKey || !validKeys.includes(providedKey))) {
      logger.warn("[JulesWebhookBroadcaster] Rejected unauthorized connection");
      // Use standard connection close properly
      connection.close(4001, "Unauthorized");
      return;
    }

    logger.info(`[JulesWebhookBroadcaster] Connection accepted: ${connection.id}`);
  }

  /**
   * Called when a client sends a message.
   * Handles `{"type":"ping"}` → responds with `{"type":"pong","timestamp":...}`.
   */
  async onMessage(connection: Connection, message: WSMessage): Promise<void> {
    const logger = new Logger(this.env, "JulesWebhookBroadcaster");
    try {
      const text = typeof message === "string" ? message : new TextDecoder().decode(message);
      const parsed = JSON.parse(text) as { type?: string };
      if (parsed?.type === "ping") {
        connection.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
      }
    } catch (e: any) {
      logger.warn("Received non-JSON or invalid message on WebSocket", { error: e.message || String(e) });
    }
  }

  /**
   * Handles traditional HTTP requests to this Agent.
   */
  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health" || url.pathname === "/api/health") {
      return Response.json({ status: "ok", agent: "JulesWebhookBroadcaster" });
    }
    if (url.pathname === "/internal/broadcast" && request.method === "POST") {
      return this.handleBroadcast(request);
    }
    return new Response("Not Found", { status: 404 });
  }

  /**
   * @callable RPC method for broadcasting events.
   * Can be invoked directly via the Agents SDK.
   */
  @callable()
  async broadcastEvent(message: JulesLiveMessage & { projectId?: string }): Promise<{ ok: boolean; clients: number }> {
    const payload = JSON.stringify(message);
    let sent = 0;

    if (message.projectId) {
      // Fan out to project subscribers + system:all, deduped by connection.id
      const seen = new Set<string>();
      for (const conn of this.getConnections(message.projectId)) {
        if (!seen.has(conn.id)) { 
          seen.add(conn.id); 
          conn.send(payload); 
          sent++; 
        }
      }
      for (const conn of this.getConnections("system:all")) {
        if (!seen.has(conn.id)) { 
          seen.add(conn.id); 
          conn.send(payload); 
          sent++; 
        }
      }
    } else {
      // Broadcast to all via SDK method
      for (const conn of this.getConnections()) {
        conn.send(payload); 
        sent++;
      }
    }

    return { ok: true, clients: sent };
  }

  /**
   * Broadcast handler — called by the Jules webhook route handlers when
   * Jules posts an event or status update. Deserializes the payload and
   * sends it to the appropriate connected WebSocket clients.
   */
  private async handleBroadcast(request: Request): Promise<Response> {
    const logger = new Logger(this.env, "JulesWebhookBroadcaster");
    let message: JulesLiveMessage & { projectId?: string };
    try {
      message = (await request.json()) as JulesLiveMessage & { projectId?: string };
    } catch (e: any) {
      logger.error("Invalid JSON body in broadcast", { error: e.message || String(e) });
      return new Response("Invalid JSON body", { status: 400 });
    }

    const { ok, clients } = await this.broadcastEvent(message);
    return Response.json({ ok, clients });
  }
}
