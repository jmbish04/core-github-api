/**
 * @file src/do/AgentSessionDO.ts
 * @description Hibernatable WebSocket DO for multi-agent synchronization
 * @deprecated Use AgenticSession service instead (see @/services/agentic-session).
 *   This DO's schema is strictly superseded by the AgenticSession tables.
 *   Migrate to the new service for real-time agent collaboration and transparency.
 */

import { DurableObject } from "cloudflare:workers";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { agentSessions, researchFindings } from "@/db/schemas/app/research";
import { eq } from "drizzle-orm";

const AgentThoughtSchema = z.object({
  type: z.literal("agent_thought"),
  payload: z.object({
    agentRole: z.string(),
    thought: z.string(),
  }),
});

const AgentFindingSchema = z.object({
  type: z.literal("agent_finding"),
  payload: z.object({
    repoUrl: z.string(),
    summary: z.string(),
    agentRole: z.string(),
  }),
});

const SyncRequestSchema = z.object({
  type: z.literal("sync_request"),
});

const InboundMessageSchema = z.discriminatedUnion("type", [
  AgentThoughtSchema,
  AgentFindingSchema,
  SyncRequestSchema,
]);

type Attachment = { sessionId: string };

export class AgentSessionDO extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const url = new URL(request.url);
    // Assuming the URL structure puts sessionId at the end, or uses a query param
    const pathParts = url.pathname.split('/');
    const pathSessionId = pathParts[pathParts.length - 1];
    const querySessionId = url.searchParams.get("sessionId");
    const sessionId = querySessionId || pathSessionId || "default-session";

    const db = drizzle(this.env.DB);
    const existingSession = await db.select().from(agentSessions).where(eq(agentSessions.sessionId, sessionId)).get();
    
    if (!existingSession) {
      await db.insert(agentSessions).values({
        sessionId,
        status: "active",
      }).onConflictDoNothing();
    }

    const pair = new WebSocketPair();
    const { 0: client, 1: server } = pair;
    
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ sessionId });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const text = typeof message === "string" ? message : new TextDecoder().decode(message);
    const attachment = ws.deserializeAttachment() as Attachment | null;
    const sessionId = attachment?.sessionId;

    if (!sessionId) {
      ws.send(JSON.stringify({ type: "error", payload: "Missing sessionId attachment" }));
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      ws.send(JSON.stringify({ type: "error", payload: "Invalid JSON" }));
      return;
    }

    const result = InboundMessageSchema.safeParse(parsed);
    if (!result.success) {
      ws.send(JSON.stringify({ type: "error", payload: "Invalid message schema", details: result.error.issues }));
      return;
    }

    const db = drizzle(this.env.DB);
    const data = result.data;

    switch (data.type) {
      case "agent_thought":
        this.broadcast(ws, data);
        break;

      case "agent_finding":
        // Persist to D1
        await db.insert(researchFindings).values({
          id: crypto.randomUUID(),
          sessionId,
          repoUrl: data.payload.repoUrl,
          summary: data.payload.summary,
          agentRole: data.payload.agentRole,
        });
        // Broadcast to other agents
        this.broadcast(ws, data);
        break;

      case "sync_request": {
        // Fetch all findings for this session
        const findings = await db.select().from(researchFindings).where(eq(researchFindings.sessionId, sessionId)).all();
        ws.send(JSON.stringify({
          type: "sync_response",
          payload: { findings },
        }));
        break;
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, _wasClean: boolean) {
    try {
      ws.close(code, reason);
    } catch (e) {
      console.error("AgentSessionDO WebSocket close error", JSON.stringify(e));
    }
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    console.error("AgentSessionDO WebSocket error", JSON.stringify(error));
  }

  private broadcast(sender: WebSocket, message: any) {
    const msgStr = JSON.stringify(message);
    for (const sock of this.ctx.getWebSockets()) {
      if (sock !== sender && sock.readyState === 1) {
        try {
          sock.send(msgStr);
        } catch (e) {
          console.error("Broadcast error", JSON.stringify(e));
        }
      }
    }
  }
}
