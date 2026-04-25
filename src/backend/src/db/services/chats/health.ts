/**
 * @file db/services/chats/health.ts
 * @description Health check for the chats service layer.
 *
 * Checks:
 * 1. **database** — can we query the `threads` and `messages` tables?
 * 2. **pendingTitles** — count of threads awaiting AI title generation (informational)
 * 3. **aiProvider** — can AIProvider instantiate successfully for `worker-ai`?
 */

import { sql, isNull, count } from 'drizzle-orm';
import { getDb } from '@db';
import { threads } from '@db/schemas/chats/threads';
import { messages } from '@db/schemas/chats/messages';
import { Logger } from '@/lib/logger';
import { AIProvider } from '@/ai/providers';

const loggerService = 'ChatsHealth';
const lp = '[ChatsHealth]:';

export interface ChatsHealthResult {
  status: 'ok' | 'degraded' | 'failed';
  details: {
    database: 'ok' | 'error' | 'pending';
    threadCount: number | null;
    messageCount: number | null;
    pendingTitles: number | null;
    aiProvider: 'ok' | 'error' | 'pending';
    durationMs: number;
  };
}

export async function checkChatsHealth(env: Env): Promise<ChatsHealthResult> {
  const logger = new Logger(env, loggerService);
  const startedAt = Date.now();

  const details: ChatsHealthResult['details'] = {
    database: 'pending',
    threadCount: null,
    messageCount: null,
    pendingTitles: null,
    aiProvider: 'pending',
    durationMs: 0,
  };

  let isDegraded = false;
  let isFailed = false;

  // ── 1. Database — table queryability + row counts ────────────────────────

  try {
    const db = getDb(env.DB);

    // Sanity: raw SELECT 1 to verify D1 binding is up
    await db.run(sql`SELECT 1`);

    const [{ value: threadCount }] = await db
      .select({ value: count() })
      .from(threads);

    const [{ value: messageCount }] = await db
      .select({ value: count() })
      .from(messages);

    const [{ value: pendingTitles }] = await db
      .select({ value: count() })
      .from(threads)
      .where(isNull(threads.titleGeneratedAt));

    details.database = 'ok';
    details.threadCount = threadCount;
    details.messageCount = messageCount;
    details.pendingTitles = pendingTitles;

    if (pendingTitles > 50) {
      // High backlog of un-titled threads — surface as degraded
      logger.warn(`${lp} ${pendingTitles} threads pending title generation (threshold: 50)`);
      isDegraded = true;
    }

    logger.info(`${lp} DB ok — threads: ${threadCount}, messages: ${messageCount}, pending titles: ${pendingTitles}`);
  } catch (err: any) {
    logger.error(`${lp} Database check failed: ${err.message}`, err);
    details.database = 'error';
    isFailed = true;
  }

  // ── 2. AI Provider — dry-run instantiation (no inference call) ────────────

  try {
    // Instantiating AIProvider validates env bindings without issuing a real call
    const ai = new AIProvider(env);
    const { provider } = ai.resolveInvocation('text', 'worker-ai');
    if (provider !== 'worker-ai') {
      throw new Error(`Unexpected provider resolved: ${provider}`);
    }
    details.aiProvider = 'ok';
    logger.info(`${lp} AIProvider ok — resolved provider: ${provider}`);
  } catch (err: any) {
    logger.error(`${lp} AIProvider check failed: ${err.message}`, err);
    details.aiProvider = 'error';
    isDegraded = true; // Title gen will silently fail, but chat still works
  }

  // ── Result ─────────────────────────────────────────────────────────────────

  details.durationMs = Date.now() - startedAt;
  const status = isFailed ? 'failed' : isDegraded ? 'degraded' : 'ok';

  if (status === 'ok') {
    logger.info(`${lp} Health check passed in ${details.durationMs}ms`);
  } else {
    logger.warn(`${lp} Health check returned ${status} in ${details.durationMs}ms`, { details });
  }

  return { status, details };
}
