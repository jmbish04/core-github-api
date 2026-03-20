import { DurableObject } from "cloudflare:workers";
import type {
  PlanningMonitorEvent,
  PlanningMonitorSnapshot,
} from "@/services/planning/monitor";

const SNAPSHOT_KEY = "snapshot";
const MAX_EVENTS = 50;

function createDefaultSnapshot(requestId: string): PlanningMonitorSnapshot {
  return {
    requestId,
    status: "queued",
    updatedAt: new Date().toISOString(),
    recentEvents: [],
  };
}

export class PlanningMonitor extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws" && request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocketUpgrade(url.searchParams.get("requestId") || "unknown");
    }

    if (url.pathname === "/internal/broadcast" && request.method === "POST") {
      return this.handleBroadcast(request);
    }

    if (url.pathname === "/internal/snapshot" && request.method === "GET") {
      const snapshot = await this.getSnapshot();
      return Response.json(snapshot);
    }

    return new Response("Not found", { status: 404 });
  }

  private async getSnapshot(requestId = "unknown"): Promise<PlanningMonitorSnapshot> {
    const stored = await this.ctx.storage.get<PlanningMonitorSnapshot>(SNAPSHOT_KEY);
    return stored || createDefaultSnapshot(requestId);
  }

  private async persistSnapshot(snapshot: PlanningMonitorSnapshot): Promise<void> {
    await this.ctx.storage.put(SNAPSHOT_KEY, snapshot);
  }

  private handleWebSocketUpgrade(requestId: string): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);

    this.getSnapshot(requestId).then((snapshot) => {
      server.send(
        JSON.stringify({
          type: "SNAPSHOT",
          snapshot,
        }),
      );
    }).catch((error) => {
      server.send(
        JSON.stringify({
          type: "ERROR",
          message: error instanceof Error ? error.message : "Failed to load snapshot",
        }),
      );
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleBroadcast(request: Request): Promise<Response> {
    const event = (await request.json()) as PlanningMonitorEvent;
    const snapshot = await this.getSnapshot(event.requestId);
    const recentEvents = [...snapshot.recentEvents, event].slice(-MAX_EVENTS);

    const nextSnapshot: PlanningMonitorSnapshot = {
      ...snapshot,
      requestId: event.requestId,
      updatedAt: event.ts,
      status: event.status || snapshot.status,
      plan: event.plan || snapshot.plan,
      latestMessage: event.message || snapshot.latestMessage,
      latestProgress:
        event.type === "PROGRESS"
          ? {
              title: event.title,
              message: event.message,
            }
          : snapshot.latestProgress,
      latestDiff: event.files || snapshot.latestDiff,
      artifact: event.artifact || snapshot.artifact,
      recentEvents,
    };

    await this.persistSnapshot(nextSnapshot);

    const payload = JSON.stringify(event);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(payload);
      } catch {
        // Closed sockets are pruned by the runtime.
      }
    }

    return Response.json({ ok: true, clients: this.ctx.getWebSockets().length });
  }

  async webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer): Promise<void> {
    // Monitor sockets are currently subscribe-only.
  }

  async webSocketClose(
    _ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    // No-op.
  }

  async webSocketError(_ws: WebSocket, _error: unknown): Promise<void> {
    // No-op.
  }
}
