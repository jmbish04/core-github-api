/**
 * @file src/do/RoomDO.ts
 * @description Hibernatable WebSocket Durable Object for real-time collaboration
 * @owner AI-Builder
 */

import { DurableObject } from "cloudflare:workers";
import { z } from "zod";

// WebSocket message schemas with discriminated union
const PingMessageSchema = z.object({
  type: z.literal("ping"),
  payload: z.any().optional(),
});

const BroadcastMessageSchema = z.object({
  type: z.literal("broadcast"),
  payload: z.any(),
  meta: z.any().optional(),
});

const ListClientsMessageSchema = z.object({
  type: z.literal("list_clients"),
});

// Known message types for validation
const KNOWN_MESSAGE_TYPES = [
  "ping",
  "broadcast",
  "list_clients",
] as const;

// Discriminated union of all possible inbound messages
const InboundMessageSchema = z.discriminatedUnion("type", [
  PingMessageSchema,
  BroadcastMessageSchema,
  ListClientsMessageSchema,
  // Fallback for unknown message types
  z.object({
    type: z.string().refine(
      (val) => !(KNOWN_MESSAGE_TYPES as readonly string[]).includes(val),
      { message: "Unknown message type should not match known types" }
    ),
    payload: z.any().optional(),
    meta: z.any().optional(),
  }),
]);

interface WebSocketMeta {
  id: string;
  connectedAt: string;
  projectId: string;
  clientInfo?: Record<string, unknown>;
  messageCount: number;
  lastMessageTime: number;
}

// Security constants
const MAX_MESSAGE_SIZE = 64 * 1024; // 64KB max message size
const MAX_MESSAGES_PER_SECOND = 10; // Rate limiting
const RATE_LIMIT_WINDOW_MS = 1000; // 1 second window

export class RoomDO extends DurableObject {
  private socketMeta: WeakMap<WebSocket, WebSocketMeta> = new WeakMap();

  /**
   * Handle incoming HTTP requests and upgrade to WebSocket if appropriate
   */
  async fetch(request: Request): Promise<Response> {
    // Check if this is a WebSocket upgrade request
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    // Extract project ID and client info from request
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId") || "default";
    const clientInfo = url.searchParams.get("clientInfo");

    // Create WebSocket pair
    const pair = new WebSocketPair();
    const { 0: client, 1: server } = pair;

    // Accept the WebSocket using the hibernatable API
    this.ctx.acceptWebSocket(server);

    // Store metadata for this connection
    const meta: WebSocketMeta = {
      id: crypto.randomUUID(),
      connectedAt: new Date().toISOString(),
      projectId,
      clientInfo: (() => {
        if (!clientInfo) return undefined;
        try {
          const parsed = JSON.parse(clientInfo);
          const result = z.record(z.unknown()).safeParse(parsed);
          if (result.success) return result.data;
          console.warn('Invalid clientInfo schema:', result.error);
        } catch (error) {
          console.warn('Failed to parse clientInfo JSON:', error);
        }
        return undefined; // Gracefully handle parse errors
      })(),
      messageCount: 0,
      lastMessageTime: Date.now(),
    };
    this.socketMeta.set(server, meta);

    // Send welcome message
    server.send(JSON.stringify({
      type: "connected",
      payload: {
        socketId: meta.id,
        projectId: meta.projectId,
        timestamp: meta.connectedAt,
      },
      meta: {
        totalConnections: this.ctx.getWebSockets().length,
      },
    }));

    // Broadcast to other clients that a new client connected
    this.broadcast(server, {
      type: "client_joined",
      payload: {
        socketId: meta.id,
        projectId: meta.projectId,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  /**
   * Handle incoming WebSocket messages (hibernatable API)
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    try {
      // Get sender metadata
      const senderMeta = this.socketMeta.get(ws);
      if (!senderMeta) {
        console.error("WebSocket metadata not found");
        return;
      }

      // Check message size (DoS prevention)
      const messageSize = typeof message === "string" ? message.length : message.byteLength;
      if (messageSize > MAX_MESSAGE_SIZE) {
        console.warn(`Message too large: ${messageSize} bytes from ${senderMeta.id}`);
        ws.send(JSON.stringify({
          type: "error",
          payload: {
            error: "Message too large",
            maxSize: MAX_MESSAGE_SIZE,
            actualSize: messageSize,
          },
          meta: { timestamp: new Date().toISOString() },
        }));
        return;
      }

      // Rate limiting (DoS prevention)
      const now = Date.now();
      const timeSinceLastMessage = now - senderMeta.lastMessageTime;

      if (timeSinceLastMessage < RATE_LIMIT_WINDOW_MS) {
        senderMeta.messageCount++;
        if (senderMeta.messageCount > MAX_MESSAGES_PER_SECOND) {
          console.warn(`Rate limit exceeded for ${senderMeta.id}`);
          ws.send(JSON.stringify({
            type: "error",
            payload: {
              error: "Rate limit exceeded",
              maxMessagesPerSecond: MAX_MESSAGES_PER_SECOND,
            },
            meta: { timestamp: new Date().toISOString() },
          }));
          return;
        }
      } else {
        // Reset counter after window expires
        senderMeta.messageCount = 1;
        senderMeta.lastMessageTime = now;
      }

      // Convert ArrayBuffer to string if needed
      const text = typeof message === "string"
        ? message
        : new TextDecoder().decode(message);

      // Parse and validate the message
      let rawMessage: any;
      try {
        rawMessage = JSON.parse(text);
      } catch (parseError) {
        // If not JSON, treat as plain text and create a default message
        rawMessage = { type: "message", payload: { text } };
      }

      // Validate message structure with Zod
      const validationResult = InboundMessageSchema.safeParse(rawMessage);
      if (!validationResult.success) {
        console.error("Invalid WebSocket message format:", validationResult.error);
        ws.send(JSON.stringify({
          type: "error",
          payload: {
            error: "Invalid message format",
            details: validationResult.error.errors,
          },
          meta: {
            timestamp: new Date().toISOString(),
          },
        }));
        return;
      }

      const parsed = validationResult.data;

      // Enhance message with metadata (senderMeta already retrieved above)
      const enrichedMessage = {
        ...parsed,
        meta: {
          ...parsed.meta,
          sender: senderMeta?.id,
          timestamp: new Date().toISOString(),
        },
      };

      // Handle special message types
      switch (parsed.type) {
        case "ping":
          // Respond with pong
          ws.send(JSON.stringify({
            type: "pong",
            payload: parsed.payload,
            meta: {
              timestamp: new Date().toISOString(),
            },
          }));
          break;

        case "broadcast":
          // Broadcast to all other clients
          this.broadcast(ws, enrichedMessage);
          break;

        case "list_clients":
          // Send list of connected clients
          const clients = this.ctx.getWebSockets()
            .map(sock => this.socketMeta.get(sock))
            .filter(Boolean);
          ws.send(JSON.stringify({
            type: "clients_list",
            payload: { clients },
            meta: {
              timestamp: new Date().toISOString(),
              count: clients.length,
            },
          }));
          break;

        default:
          // Default: broadcast to all other clients
          this.broadcast(ws, enrichedMessage);
      }
    } catch (error) {
      console.error("Error handling WebSocket message:", error);
      ws.send(JSON.stringify({
        type: "error",
        payload: {
          error: "Failed to process message",
          details: error instanceof Error ? error.message : String(error),
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      }));
    }
  }

  /**
   * Handle WebSocket close events (hibernatable API)
   */
  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    const meta = this.socketMeta.get(ws);

    // Broadcast to other clients that a client disconnected
    if (meta) {
      this.broadcast(ws, {
        type: "client_left",
        payload: {
          socketId: meta.id,
          projectId: meta.projectId,
          code,
          reason,
          wasClean,
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Clean up metadata
    this.socketMeta.delete(ws);

    // Attempt to close the socket gracefully
    try {
      ws.close(code, "closing");
    } catch (error) {
      console.error("Error closing WebSocket:", error);
    }
  }

  /**
   * Handle WebSocket error events (hibernatable API)
   */
  async webSocketError(ws: WebSocket, error: unknown) {
    console.error("WebSocket error:", error);

    const meta = this.socketMeta.get(ws);
    if (meta) {
      console.error("WebSocket error for client:", meta.id, meta.projectId);
    }

    // Attempt to close the socket
    try {
      ws.close(1011, "error");
    } catch (closeError) {
      console.error("Error closing WebSocket after error:", closeError);
    }

    // Clean up metadata
    this.socketMeta.delete(ws);
  }

  /**
   * Broadcast a message to all connected clients except the sender
   */
  private broadcast(sender: WebSocket, message: any) {
    const messageStr = JSON.stringify(message);

    for (const sock of this.ctx.getWebSockets()) {
      if (sock !== sender && sock.readyState === 1) { // 1 = OPEN
        try {
          sock.send(messageStr);
        } catch (error) {
          console.error("Error broadcasting to socket:", error);
        }
      }
    }
  }

  /**
   * Broadcast a message to all connected clients including the sender
   */
  private broadcastAll(message: any) {
    const messageStr = JSON.stringify(message);

    for (const sock of this.ctx.getWebSockets()) {
      if (sock.readyState === 1) { // 1 = OPEN
        try {
          sock.send(messageStr);
        } catch (error) {
          console.error("Error broadcasting to socket:", error);
        }
      }
    }
  }
}
