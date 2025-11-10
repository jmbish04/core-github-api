import { DurableObject } from "cloudflare:workers";
import { broadcast, parseMessage } from "../utils/ws";
import { Env } from "../types";

export class RoomDO extends DurableObject {
  // The `ctx` property is automatically assigned by the Workers runtime.
  constructor(private readonly ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const parsedMessage = parseMessage(message);
    const sockets = this.ctx.getWebSockets();

    // Simple broadcast to all clients in the room except the sender
    const otherSockets = sockets.filter(s => s !== ws);
    broadcast(otherSockets, parsedMessage ?? message);
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    console.log(`WebSocket closed: code=${code}, reason=${reason}, wasClean=${wasClean}`);
  }

  async webSocketError(ws: WebSocket, error: any) {
    console.error("WebSocket error:", error);
  }
}
