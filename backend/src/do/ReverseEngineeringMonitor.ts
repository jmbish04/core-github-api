import { DurableObject } from 'cloudflare:workers';
import type {
  ReverseEngineeringMonitorEvent,
  ReverseEngineeringMonitorSnapshot,
} from '@/services/reverse-engineering/monitor';

const SNAPSHOT_KEY = 'snapshot';
const MAX_EVENTS = 50;

function createDefaultSnapshot(snapshotId: string): ReverseEngineeringMonitorSnapshot {
  return {
    snapshotId,
    status: 'pending',
    updatedAt: new Date().toISOString(),
    recentEvents: [],
  };
}

export class ReverseEngineeringMonitor extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/ws' && request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade(url.searchParams.get('snapshotId') || 'unknown');
    }

    if (url.pathname === '/internal/broadcast' && request.method === 'POST') {
      return this.handleBroadcast(request);
    }

    if (url.pathname === '/internal/snapshot' && request.method === 'GET') {
      const snapshot = await this.getSnapshot();
      return Response.json(snapshot);
    }

    return new Response('Not found', { status: 404 });
  }

  private async getSnapshot(snapshotId = 'unknown'): Promise<ReverseEngineeringMonitorSnapshot> {
    const stored = await this.ctx.storage.get<ReverseEngineeringMonitorSnapshot>(SNAPSHOT_KEY);
    return stored || createDefaultSnapshot(snapshotId);
  }

  private async persistSnapshot(snapshot: ReverseEngineeringMonitorSnapshot): Promise<void> {
    await this.ctx.storage.put(SNAPSHOT_KEY, snapshot);
  }

  private handleWebSocketUpgrade(snapshotId: string): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);

    this.getSnapshot(snapshotId)
      .then((snapshot) => {
        server.send(JSON.stringify({ type: 'SNAPSHOT', snapshot }));
      })
      .catch((error) => {
        server.send(
          JSON.stringify({
            type: 'ERROR',
            message: error instanceof Error ? error.message : 'Failed to load snapshot',
          }),
        );
      });

    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleBroadcast(request: Request): Promise<Response> {
    const event = (await request.json()) as ReverseEngineeringMonitorEvent;
    const snapshot = await this.getSnapshot(event.snapshotId);
    const recentEvents = [...snapshot.recentEvents, event].slice(-MAX_EVENTS);
    const data = (event.data || {}) as Record<string, unknown>;

    const nextSnapshot: ReverseEngineeringMonitorSnapshot = {
      ...snapshot,
      snapshotId: event.snapshotId,
      updatedAt: event.ts,
      status: event.status || snapshot.status,
      latestMessage: event.message || snapshot.latestMessage,
      screenshotUrls: Array.isArray(data.screenshotUrls)
        ? (data.screenshotUrls as string[])
        : snapshot.screenshotUrls,
      resolvedPreviewUrl:
        typeof data.resolvedPreviewUrl === 'string'
          ? data.resolvedPreviewUrl
          : snapshot.resolvedPreviewUrl,
      recentEvents,
    };

    await this.persistSnapshot(nextSnapshot);

    const payload = JSON.stringify(event);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(payload);
      } catch {
        // Ignore closed sockets.
      }
    }

    return Response.json({ ok: true, clients: this.ctx.getWebSockets().length });
  }

  async webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer): Promise<void> {}
  async webSocketClose(_ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {}
  async webSocketError(_ws: WebSocket, _error: unknown): Promise<void> {}
}
