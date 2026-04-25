/**
 * @file shared/chat-persistence.ts
 * @description Shared Drizzle-based D1 persistence layer for the unified chat schema.
 *
 * Pure functions — no DurableObjectState, no ctx.waitUntil(), no agent coupling.
 * Any agent, route, or workflow can import and call these directly.
 *
 * Schema dependencies:
 *   - threads          (db/schemas/chats/threads.ts)
 *   - messages         (db/schemas/chats/messages.ts)
 *   - threadParticipants (db/schemas/chats/participants.ts)
 */

import { eq, desc, and } from 'drizzle-orm';
import { threads, messages, threadParticipants } from '@db/schemas/chats';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- accept any Drizzle schema
type Db = DrizzleD1Database<any>;

// ── Thread Operations ────────────────────────────────────────────────────

/**
 * Upsert a thread keyed on `uuid` (the stable external identifier).
 * Returns the integer PK (`id`) for FK use in messages/participants.
 *
 * @param db     - Drizzle D1 database instance
 * @param uuid   - Stable external key (roomId, conversationId, etc.)
 * @param title  - Optional thread title
 * @returns The integer `id` of the thread
 */
export async function upsertThread(
  db: Db,
  uuid: string,
  title?: string | null,
): Promise<number> {
  await db
    .insert(threads)
    .values({
      uuid,
      title: title ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: threads.uuid,
      set: { updatedAt: new Date(), ...(title !== undefined ? { title } : {}) },
    });

  const [thread] = await db
    .select({ id: threads.id })
    .from(threads)
    .where(eq(threads.uuid, uuid))
    .limit(1);

  if (!thread) {
    throw new Error(`[chat-persistence] Thread not found after upsert: ${uuid}`);
  }

  return thread.id;
}

// ── Message Operations ───────────────────────────────────────────────────

/**
 * Insert a message into the structured chat schema.
 *
 * @param db        - Drizzle D1 database instance
 * @param threadId  - Integer FK from upsertThread()
 * @param role      - assistant-ui standard role
 * @param author    - Agent class name or 'user'
 * @param content   - assistant-ui parts array (already JSON-stringified or object)
 */
export async function insertMessage(
  db: Db,
  threadId: number,
  role: 'user' | 'assistant' | 'agent' | 'system' | 'tool',
  author: string,
  content: unknown,
): Promise<void> {
  await db.insert(messages).values({
    threadId,
    role,
    author,
    content: typeof content === 'string' ? JSON.parse(content) : content,
    createdAt: new Date(),
  });
}

/**
 * Retrieve messages for a thread, newest-first.
 */
export async function getThreadMessages(
  db: Db,
  threadId: number,
  limit = 50,
) {
  return db
    .select()
    .from(messages)
    .where(eq(messages.threadId, threadId))
    .orderBy(desc(messages.createdAt))
    .limit(limit)
    .all();
}

// ── Participant Operations ───────────────────────────────────────────────

/**
 * Record an agent or user as a participant in a thread.
 * Uses ON CONFLICT DO UPDATE (upsert) so duplicate joins are idempotent.
 *
 * @param db        - Drizzle D1 database instance
 * @param threadId  - Integer FK from upsertThread()
 * @param agentName - Agent class name or 'user:<username>'
 * @param role      - 'host', 'participant', or 'user'
 */
export async function addParticipant(
  db: Db,
  threadId: number,
  agentName: string,
  role: 'host' | 'participant' | 'user' = 'participant',
): Promise<void> {
  await db
    .insert(threadParticipants)
    .values({
      threadId,
      agentName,
      role,
      joinedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [threadParticipants.threadId, threadParticipants.agentName],
      set: { role }, // update role if re-joining with a different role
    });
}

/**
 * Get all active participants for a thread (leftAt IS NULL).
 */
export async function getParticipants(
  db: Db,
  threadId: number,
) {
  return db
    .select()
    .from(threadParticipants)
    .where(
      and(
        eq(threadParticipants.threadId, threadId),
        // Active participants only — leftAt is null
      ),
    )
    .all();
}

/**
 * Mark a participant as having left the thread.
 */
export async function removeParticipant(
  db: Db,
  threadId: number,
  agentName: string,
): Promise<void> {
  await db
    .update(threadParticipants)
    .set({ leftAt: new Date() })
    .where(
      and(
        eq(threadParticipants.threadId, threadId),
        eq(threadParticipants.agentName, agentName),
      ),
    );
}
