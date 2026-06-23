/**
 * @file ChatRoom/methods/messaging.ts
 * @description Core ChatRoom methods — post, tail, subscribe, and D1 mirroring.
 *              Pure functions with DI.
 *
 * EdigraphService is used for episodic memory (fire-and-forget) so that
 * cross-session context is available for future AI responses.
 *
 * D1 thread/message mirroring delegates to shared/chat-persistence.ts.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@db";
import { chatRoomLogs, chatRoomSubscribers } from "@db/schemas/agents/mirror";
import { upsertThread, insertMessage, addParticipant } from "@/shared/chat-persistence";
import { EdigraphService } from "@/ai/providers";
import { Logger } from "@/lib/logger";
import type { ChatMessage } from "../types";

// ── Types ──────────────────────────────────────────────────────────────
type ChatRoomDeps = {
  ctx: DurableObjectState;
  env: Env;
  broadcast: (msg: string, exclude?: string[]) => void;
  roomId: string;
};

// ── Methods ────────────────────────────────────────────────────────────

export function persistMessage(deps: ChatRoomDeps, msg: ChatMessage): void {
  const logger = new Logger(deps.env, "ChatRoom:messaging");
  logger.info(`[ChatRoomAgent - persistMessage] Persisting message: ${JSON.stringify(msg)}`);
  deps.ctx.storage.sql.exec(
    `INSERT OR REPLACE INTO chat_messages (id, user, text, type, metadata_json, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`,
    crypto.randomUUID(),
    msg.user,
    msg.text ?? null,
    msg.type,
    msg.metadata ? JSON.stringify(msg.metadata) : null,
    msg.timestamp,
  );
}

export function readTail(deps: ChatRoomDeps, limit = 50): ChatMessage[] {
  try {
    const rows = deps.ctx.storage.sql
      .exec(
        `SELECT user, text, type, metadata_json, timestamp
         FROM chat_messages ORDER BY timestamp DESC LIMIT ?`,
        limit,
      )
      .toArray();

    return rows.reverse().map((row: any) => ({
      type: row.type as ChatMessage["type"],
      user: row.user as string,
      text: row.text as string | undefined,
      timestamp: row.timestamp as number,
      metadata: row.metadata_json
        ? JSON.parse(row.metadata_json as string)
        : undefined,
    }));
  } catch {
    return [];
  }
}

export function addSubscriber(deps: ChatRoomDeps, agentName: string): void {
  deps.ctx.storage.sql.exec(
    `INSERT OR REPLACE INTO chat_subscribers (agent_name, subscribed_at)
     VALUES (?, ?)`,
    agentName,
    Date.now(),
  );
  // Fire-and-forget D1 mirror so subscriptions survive redeploy
  mirrorSubscriberToD1(deps, agentName).catch((err) => {
    const logger = new Logger(deps.env, "ChatRoom:messaging");
    logger.error("Failed to mirror subscriber to D1:", { error: String(err) });
  });
}

export async function mirrorSubscriberToD1(
  deps: ChatRoomDeps,
  agentName: string,
): Promise<void> {
  const db = getDb(deps.env.DB);
  await db
    .insert(chatRoomSubscribers)
    .values({
      roomId: deps.roomId,
      agentName,
      subscribedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [chatRoomSubscribers.roomId, chatRoomSubscribers.agentName],
      set: { subscribedAt: new Date() },
    });
}

export async function mirrorToD1(
  deps: ChatRoomDeps,
  msg: ChatMessage,
  userId?: string,
): Promise<void> {
  try {
    const db = getDb(deps.env.DB);
    await db.insert(chatRoomLogs).values({
      id: crypto.randomUUID(),
      roomId: deps.roomId,
      userId: userId || null,
      userName: msg.user,
      messageType: msg.type,
      content: msg.text || null,
      metadataJson: msg.metadata ? JSON.stringify(msg.metadata) : null,
      timestamp: new Date(msg.timestamp).toISOString(),
    });
  } catch (err) {
    const logger = new Logger(deps.env, "ChatRoom:messaging");
    logger.error("Failed to mirror message to D1:", { error: String(err) });
  }
}

/**
 * Mirror a chat message into the structured `threads` + `messages` D1 tables
 * via the shared chat-persistence service. Keeps canonical chat history
 * queryable via Drizzle without coupling to this DO.
 *
 * Call via `ctx.waitUntil()` or fire-and-forget — never in the hot path.
 */
export async function mirrorThreadMessage(
  deps: ChatRoomDeps,
  msg: ChatMessage,
  userId?: string,
): Promise<void> {
  if (msg.type !== "message") return; // only persist actual messages, not join/leave events

  try {
    const db = getDb(deps.env.DB);

    // 1. Upsert thread — delegates to shared service
    const threadId = await upsertThread(db, deps.roomId);

    // 2. Derive role
    const role: "user" | "assistant" | "agent" =
      userId ? "user" : msg.user === "assistant" ? "assistant" : "agent";

    // 3. Build assistant-ui compatible parts array
    const contentParts = [
      { type: "text", text: msg.text ?? "" },
      ...(msg.metadata ? [{ type: "data", data: msg.metadata }] : []),
    ];

    // 4. Insert message via shared service
    await insertMessage(db, threadId, role, msg.user, contentParts);

    // 5. Record participant (idempotent upsert)
    const participantRole = userId ? 'user' as const : 'participant' as const;
    await addParticipant(db, threadId, userId ? `user:${msg.user}` : msg.user, participantRole);
  } catch (err) {
    const logger = new Logger(deps.env, "ChatRoom:messaging");
    logger.error("Failed to mirror thread message to D1:", { error: String(err) });
  }
}

/**
 * Fire-and-forget: save a chat message as an episodic memory entry in Edigraph.
 * Call via `ctx.waitUntil()` to avoid blocking the response path.
 *
 * @param deps - ChatRoom dependencies (env must have EDGRAPH binding).
 * @param msg  - The chat message to save.
 * @param sessionId - Edigraph session partition key (use roomId or userId).
 */
export async function saveEpisodicMemory(
  deps: ChatRoomDeps,
  msg: ChatMessage,
  sessionId: string,
): Promise<void> {
  const logger = new Logger(deps.env, "ChatRoom:messaging");
  const logPrefix = "[ChatRoomAgent - saveEpisodicMemory]";
  const newMemory = {
    role: msg?.user === 'assistant' ? 'assistant' : 'user',
    roomId: deps?.roomId,
    messageType: msg?.type,
    sessionId: sessionId,
    rawMsg: msg,
  };
  logger.info(`${logPrefix} Attempting to add episodic memory for sessionId: ${sessionId}; ${JSON.stringify(newMemory)}`);
  if (!deps.env.EDGRAPH) {
    logger.error(`${logPrefix} EDGRAPH binding is not available`);
    return;
  }
  try {
    const memory = new EdigraphService(deps.env.EDGRAPH, sessionId);
    await memory.addEpisodic(msg.text ?? JSON.stringify(msg.metadata ?? {}), newMemory);
    logger.info(`${logPrefix} Successfully added episodic memory for sessionId: ${sessionId}; ${JSON.stringify(newMemory)}`);
  } catch (err) {
    logger.error(`${logPrefix} Failed to add episodic memory: ${String(err)}`);
  }
}

/**
 * Retrieve recent episodic context for a session to enrich AI system prompts.
 * Returns an empty array if EDGRAPH is unavailable.
 */
export async function retrieveMemoryContext(
  deps: ChatRoomDeps,
  query: string,
  sessionId: string,
  limit = 5,
): Promise<string[]> {
  const logger = new Logger(deps.env, "ChatRoom:messaging");
  const logPrefix = "[ChatRoomAgent - retrieveMemoryContext]";
  logger.info(`${logPrefix} Attempting to retrieve episodic memory for query: ${query}; sessionId: ${sessionId}`);
  if (!deps.env.EDGRAPH) {
    logger.error(`${logPrefix} EDGRAPH binding is not available`);
    return [];
  }
  try {
    const memory = new EdigraphService(deps.env.EDGRAPH, sessionId);
    const entries = await memory.searchSemantic(query, limit);
    logger.info(`${logPrefix} Successfully retrieved episodic memories for query: ${query}; sessionId: ${sessionId}; Now extracting Facts from the Results: ${JSON.stringify(entries)}`);
    const facts: string[] = [];
    for (const entry of entries) {
      logger.info(`${logPrefix} Extracted fact ${entry.fact} from episodic memory: ${JSON.stringify(entry)}`);
      const extractedFact = (entry.fact ?? '').trim();
      if (!facts.toString().toLowerCase().split(',').includes(extractedFact.toLowerCase())) {
        facts.push(extractedFact);
      }
      else {
        logger.info(`${logPrefix} Duplicate Fact detected and excluded from output; Excluded Duplicate Fact: ${extractedFact}`);
      }
    }
    logger.info(`${logPrefix} Retrieved (${facts.length}) unique facts: ${JSON.stringify(facts)}`);
    return facts;
  } catch (err) {
    logger.error(`${logPrefix} Failed to retrieve episodic memory: ${String(err)}`);
    return [];
  }
}
