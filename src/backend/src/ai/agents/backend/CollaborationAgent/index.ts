/**
 * @file CollaborationAgent/index.ts
 * @description CollaborationAgent — WebSocket-based collaboration room
 *              with server-side message injection, D1 mirroring, and
 *              subscriber notification for agent orchestration.
 */
import { callable } from "agents";
import type { Connection, ConnectionContext } from "agents";
import { BaseAgent, type PersistentAgentState } from '@/ai/providers';
import * as messaging from "./methods";
import type { HealthCheck, HealthMode } from '@/ai/providers/agent-support/health';
import type { ChatMessage } from "./types";

export class CollaborationAgent extends BaseAgent<PersistentAgentState> {
  initialState: PersistentAgentState = { status: 'idle', history: [] };
  protected get skills() {
    return [];
  }
  protected get agentName(): string {
    return 'CollaborationAgent';
  }

  async agentInit() {
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS chat_messages (
          id TEXT PRIMARY KEY,
          user TEXT NOT NULL,
          text TEXT,
          type TEXT NOT NULL DEFAULT 'message',
          metadata_json TEXT,
          timestamp INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_chat_messages_ts ON chat_messages (timestamp);

        CREATE TABLE IF NOT EXISTS chat_subscribers (
          agent_name TEXT PRIMARY KEY,
          subscribed_at INTEGER NOT NULL
        );
      `);
    });
  }

  private get roomId(): string {
    return (
      (this as any).id?.toString() ||
      (this as any).ctx?.id?.toString() ||
      "unknown"
    );
  }

  private get deps() {
    return {
      ctx: this.ctx,
      env: this.env,
      broadcast: this.broadcast.bind(this),
      roomId: this.roomId,
    };
  }

  // ── RPC Methods ─────────────────────────────────────────────────────


  // ── Layer 3 Health Checks ────────────────────────────────────────────
  // healthProbe() is inherited from BaseChatAgent as @callable() —
  // it automatically invokes agentHealthChecks() below.

  protected override async agentHealthChecks(_mode: HealthMode): Promise<HealthCheck[]> {
    const checks: HealthCheck[] = [];
    const start = Date.now();

    try {
      const msgRow = this.ctx.storage.sql
        .exec(`SELECT COUNT(*) as cnt FROM chat_messages`)
        .toArray();
      const messageCount = (msgRow[0] as any)?.cnt ?? 0;

      const subRow = this.ctx.storage.sql
        .exec(`SELECT COUNT(*) as cnt FROM chat_subscribers`)
        .toArray();
      const subscriberCount = (subRow[0] as any)?.cnt ?? 0;

      checks.push({
        name: 'agent.collab.roomStats',
        layer: 3,
        category: 'storage',
        status: 'pass',
        durationMs: Date.now() - start,
        message: `${messageCount} messages, ${subscriberCount} subscribers`,
        details: { messageCount, subscriberCount },
      });
    } catch (err: any) {
      checks.push({
        name: 'agent.collab.roomStats',
        layer: 3,
        category: 'storage',
        status: 'fail',
        durationMs: Date.now() - start,
        message: 'Room stats query failed (tables may not exist)',
        error: err.message,
      });
    }

    return checks;
  }

  @callable()
  async post(source: string, text: string, metadata?: any): Promise<void> {
    this.logger.info(`[post] Message from ${source}: ${text.slice(0, 80)}`);
    const msg: ChatMessage = {
      type: "message",
      user: source,
      text,
      timestamp: Date.now(),
      metadata,
    };

    messaging.persistMessage(this.deps, msg);
    this.broadcast(JSON.stringify(msg));
    // Flat audit log (all event types)
    this.ctx.waitUntil(messaging.mirrorToD1(this.deps, msg));
    // Structured chats schema — threads + messages FK model
    this.ctx.waitUntil(messaging.mirrorThreadMessage(this.deps, msg));
  }

  @callable()
  async tail(limit = 50): Promise<ChatMessage[]> {
    this.logger.info(`[tail] Fetching last ${limit} messages`);
    return messaging.readTail(this.deps, limit);
  }

  @callable()
  async subscribe(subscriberAgent: string): Promise<void> {
    this.logger.info(`[subscribe] Agent subscribing: ${subscriberAgent}`);
    messaging.addSubscriber(this.deps, subscriberAgent);
  }

  // ── WebSocket Lifecycle ─────────────────────────────────────────────

  async onConnect(connection: Connection, ctx: ConnectionContext) {
    const url = new URL(ctx.request.url);
    const username = url.searchParams.get("username") || "Anonymous";
    const userId = url.searchParams.get("userId") || connection.id;

    this.logger.info(`[onConnect] User connected: ${username} (${userId})`);
    connection.setState({ username, userId });

    const joinMessage: ChatMessage = {
      type: "join",
      user: username,
      timestamp: Date.now(),
    };

    this.broadcast(JSON.stringify(joinMessage), [connection.id]);
    await messaging.mirrorToD1(this.deps, joinMessage);
  }

  async onMessage(connection: Connection, message: string) {
    if (typeof message !== "string") return;

    let parsed: any;
    try {
      parsed = JSON.parse(message);
    } catch {
      parsed = { text: message };
    }

    const { username, userId } = connection.state as {
      username: string;
      userId: string;
    };

    this.logger.info(`[onMessage] Message from ${username}: ${(parsed.text || message).slice(0, 80)}`);

    const chatMessage: ChatMessage = {
      type: "message",
      user: username,
      text: parsed.text || message,
      timestamp: Date.now(),
      metadata: parsed.metadata,
    };

    this.broadcast(JSON.stringify(chatMessage));
    // Flat audit log
    this.ctx.waitUntil(messaging.mirrorToD1(this.deps, chatMessage, userId));
    // Structured chats schema — threads + messages FK model
    this.ctx.waitUntil(messaging.mirrorThreadMessage(this.deps, chatMessage, userId));
  }

  async onClose(connection: Connection) {
    const state = connection.state as
      | { username: string; userId: string }
      | undefined;
    if (state?.username) {
      this.logger.info(`[onClose] User disconnected: ${state.username}`);
      const leaveMessage: ChatMessage = {
        type: "leave",
        user: state.username,
        timestamp: Date.now(),
      };

      this.broadcast(JSON.stringify(leaveMessage));
      await messaging.mirrorToD1(this.deps, leaveMessage, state.userId);
    }
  }
}
