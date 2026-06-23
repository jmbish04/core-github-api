/**
 * @file db/services/chats/threadTitleService.ts
 * @description AI-powered thread title generation service.
 *
 * Design:
 * - After the first message is inserted into a thread, the API layer calls
 *   `generateAndPersistThreadTitle()` as a fire-and-forget via `ctx.waitUntil`.
 * - Workers AI (@cf/meta/llama-3-8b-instruct) summarises the initial user message
 *   into a short, conversational title (≤8 words).
 * - Once generated, `threads.title` and `threads.title_generated_at` are updated.
 * - Until the title is generated, `threads.title` is NULL ("pending").
 *   The API returns `title ?? "New Conversation"` for display purposes.
 *
 * Thread lookup:
 * - Routes support either `id` (int) or `uuid` for lookups.
 * - Helper `resolveThread()` normalises both.
 */

import { eq, isNull } from 'drizzle-orm';
import { getDb } from '@db';
import { threads } from '@db/schemas/chats/threads';
import { messages } from '@db/schemas/chats/messages';
import { Logger } from '@/lib/logger';
import { AIProvider } from '@/ai/providers';
import { z } from 'zod';

const loggerService = 'ThreadTitleService';

// ── Types ───────────────────────────────────────────────────────────────────

export type ThreadLookup = { id: number } | { uuid: string };

// ── Schemas ──────────────────────────────────────────────────────────────────

/** Zod schema for the structured AI response — guarantees a typed `title` field. */
const ThreadTitleSchema = z.object({
  title: z
    .string()
    .max(100)
    .describe('A short, specific conversation title of 8 words or fewer, no punctuation, no quotes'),
});

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolves a thread by either numeric `id` or `uuid`.
 * Returns the thread row, or null if not found.
 */
export async function resolveThread(env: Env, lookup: ThreadLookup) {
  const db = getDb(env.DB);
  const condition =
    'id' in lookup
      ? eq(threads.id, lookup.id)
      : eq(threads.uuid, lookup.uuid);

  const [thread] = await db.select().from(threads).where(condition).limit(1);
  return thread ?? null;
}

// ── AI Title Generation ─────────────────────────────────────────────────────

/**
 * Generates a short AI title from the first user message in a thread,
 * then persists it back to the `threads` row.
 *
 * Intended to be called via `ctx.waitUntil()` — non-blocking.
 *
 * @example
 * // In your route handler (fire-and-forget):
 * ctx.waitUntil(generateAndPersistThreadTitle(env, threadId));
 */
export async function generateAndPersistThreadTitle(
  env: Env,
  threadId: number,
): Promise<void> {
  const logger = new Logger(env, loggerService);
  const lp = `[${loggerService}:generateTitle]:`;

  try {
    const db = getDb(env.DB);

    // 1. Fetch the first user message in the thread
    const [firstMessage] = await db
      .select({ content: messages.content })
      .from(messages)
      .where(eq(messages.threadId, threadId))
      .orderBy(messages.createdAt)
      .limit(1);

    if (!firstMessage) {
      logger.warn(`${lp} No messages found for thread ${threadId} — skipping`);
      return;
    }

    // 2. Extract text from the assistant-ui content (JSON array of parts)
    let rawContent = '';
    try {
      const parts = Array.isArray(firstMessage.content)
        ? firstMessage.content
        : JSON.parse(firstMessage.content as string);

      rawContent = parts
        .filter((p: any) => p.type === 'text')
        .map((p: any) => p.text ?? '')
        .join(' ')
        .trim();
    } catch {
      rawContent = String(firstMessage.content).slice(0, 500);
    }

    if (!rawContent) {
      logger.warn(`${lp} Empty content for thread ${threadId} — using fallback title`);
      await db
        .update(threads)
        .set({ title: 'New Conversation', titleGeneratedAt: new Date() })
        .where(eq(threads.id, threadId));
      return;
    }

    logger.info(`${lp} Generating title for thread ${threadId} from: "${rawContent.slice(0, 80)}..."`);

    // 3. Generate title via structured response — schema guarantees a typed `title` field
    const systemPrompt = 'You are a concise assistant that generates conversation titles. Respond only with a JSON object.';
    const prompt = `Summarize the following user message into a short, specific conversation title (maximum 8 words, no punctuation, no quotes):\n\n"${rawContent.slice(0, 400)}"`;

    const ai = new AIProvider(env);
    const result = await ai.generateStructuredResponse(
      prompt,
      ThreadTitleSchema,
      systemPrompt,
      { provider: 'worker-ai' },
    );

    const generatedTitle = result.title.trim().slice(0, 100) || 'New Conversation';

    logger.info(`${lp} Generated title for thread ${threadId}: "${generatedTitle}"`);

    // 4. Persist generated title
    await db
      .update(threads)
      .set({
        title: generatedTitle,
        titleGeneratedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(threads.id, threadId));

  } catch (err) {
    logger.error(`${lp} Failed to generate title for thread ${threadId}: ${err}`);
    // Non-fatal — thread remains with null title; API returns "New Conversation"
  }
}

/**
 * Batch-generates titles for all threads that are still pending
 * (title IS NULL). Useful for backfill jobs or scheduled tasks.
 */
export async function generatePendingThreadTitles(
  env: Env,
  limit = 20,
): Promise<{ processed: number; errors: number }> {
  const logger = new Logger(env, loggerService);
  const lp = `[${loggerService}:generatePending]:`;

  const db = getDb(env.DB);
  const pendingThreads = await db
    .select({ id: threads.id })
    .from(threads)
    .where(isNull(threads.titleGeneratedAt))
    .limit(limit);

  logger.info(`${lp} Found ${pendingThreads.length} threads pending title generation`);

  let processed = 0;
  let errors = 0;

  for (const { id } of pendingThreads) {
    try {
      await generateAndPersistThreadTitle(env, id);
      processed++;
    } catch {
      errors++;
    }
  }

  logger.info(`${lp} Batch complete — processed: ${processed}, errors: ${errors}`);
  return { processed, errors };
}
