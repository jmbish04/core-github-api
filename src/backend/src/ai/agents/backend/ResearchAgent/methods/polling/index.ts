/**
 * @file ResearchAgent/methods/polling/index.ts
 * @description Orchestrates periodic polling of all active tracked_sources.
 *              Dispatches to the correct method based on source type:
 *              rss → pollRSSFeed, github_search → searchGithub,
 *              discord → searchDiscordMessages, web_search → executeWebSearch.
 *
 *              After collecting new items, evaluates each for HITL proposal.
 */

import { getDb, schema } from '@db';
import { eq } from 'drizzle-orm';
import type { ResearchAgent } from '../../index';
import type { TrackedSourceRow, TrackedItemRow } from '@db/schemas/agents/research-tracking';
import { pollRSSFeed } from '../rss';
import { searchGithub } from '../github';
import { searchDiscordMessages } from '../discord';
import { executeWebSearch } from '../web-search';
import { evaluateAndProposeItems } from '../hitl';

// ---------------------------------------------------------------------------
// Frequency thresholds (milliseconds)
// ---------------------------------------------------------------------------

const FREQUENCY_MS: Record<string, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

export interface PollResult {
  sourcesChecked: number;
  newItems: number;
  hitlProposed: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Main polling orchestrator
// ---------------------------------------------------------------------------

export async function pollTrackedSources(
  agent: ResearchAgent,
): Promise<PollResult> {
  const logger = (agent as any).logger;
  const db = getDb((agent as any).env.DB);

  // Fetch all active sources
  const sources = await db
    .select()
    .from(schema.trackedSources)
    .where(eq(schema.trackedSources.isActive, true));

  const now = Date.now();
  const result: PollResult = {
    sourcesChecked: 0,
    newItems: 0,
    hitlProposed: 0,
    errors: [],
  };

  for (const source of sources) {
    // Check frequency threshold
    if (source.lastCheckedAt) {
      const lastChecked = new Date(source.lastCheckedAt).getTime();
      const thresholdMs = FREQUENCY_MS[source.frequency] ?? FREQUENCY_MS.daily;
      if (now - lastChecked < thresholdMs) {
        logger.info(`[polling] Skipping "${source.name}" — checked ${Math.round((now - lastChecked) / 60000)}m ago`);
        continue;
      }
    }

    result.sourcesChecked++;
    logger.info(`[polling] Polling source: "${source.name}" (${source.type})`);

    try {
      const newItems = await pollSingleSource(agent, source);
      result.newItems += newItems.length;

      // Evaluate new items for HITL proposals
      if (newItems.length > 0) {
        const proposed = await evaluateAndProposeItems(agent, newItems, source);
        result.hitlProposed += proposed;
      }
    } catch (err: any) {
      logger.error(`[polling] Failed to poll "${source.name}": ${err.message}`);
      result.errors.push(`${source.name}: ${err.message}`);
    }
  }

  logger.info('[polling] Poll cycle complete', result);
  return result;
}

// ---------------------------------------------------------------------------
// Dispatch to source-specific poll method
// ---------------------------------------------------------------------------

async function pollSingleSource(
  agent: ResearchAgent,
  source: TrackedSourceRow,
): Promise<TrackedItemRow[]> {
  const db = getDb((agent as any).env.DB);
  const now = new Date().toISOString();

  switch (source.type) {
    case 'rss': {
      const { items } = await pollRSSFeed(agent, source);
      return items;
    }

    case 'github_search': {
      const findings = await searchGithub(agent, source.queryOrUrl);
      const rows: TrackedItemRow[] = [];
      for (const finding of findings) {
        if (!finding.url) continue;
        // Check dedup
        const existing = await db
          .select({ id: schema.trackedItems.id })
          .from(schema.trackedItems)
          .where(eq(schema.trackedItems.url, finding.url))
          .limit(1);
        if (existing.length > 0) continue;

        const id = crypto.randomUUID();
        await db.insert(schema.trackedItems).values({
          id,
          sourceId: source.id,
          title: finding.title,
          url: finding.url,
          content: finding.content,
          emailed: false,
          hitlQueued: false,
          processedByLearningAgent: false,
        }).onConflictDoNothing();

        rows.push({
          id,
          sourceId: source.id,
          title: finding.title,
          url: finding.url!,
          content: finding.content,
          aiSummary: null,
          publishedAt: null,
          emailed: false,
          hitlQueued: false,
          hitlRecordId: null,
          processedByLearningAgent: false,
          createdAt: now,
        });
      }
      await db
        .update(schema.trackedSources)
        .set({ lastCheckedAt: now, updatedAt: now })
        .where(eq(schema.trackedSources.id, source.id));
      return rows;
    }

    case 'discord': {
      const metadata = source.metadata as any;
      const corpus = await searchDiscordMessages((agent as any).env, {
        query: source.queryOrUrl,
        guildId: metadata?.guildId,
        channelId: metadata?.channelId,
        maxMessagesPerChannel: metadata?.maxResults ?? 25,
        maxChannels: 10,
      });
      const rows: TrackedItemRow[] = [];
      for (const match of corpus.matches) {
        const url = `https://discord.com/channels/${match.guildId}/${match.channelId}/${match.messageId}`;
        const existing = await db
          .select({ id: schema.trackedItems.id })
          .from(schema.trackedItems)
          .where(eq(schema.trackedItems.url, url))
          .limit(1);
        if (existing.length > 0) continue;

        const id = crypto.randomUUID();
        await db.insert(schema.trackedItems).values({
          id,
          sourceId: source.id,
          title: `Message from ${match.author ?? 'unknown'}`,
          url,
          content: match.content,
          publishedAt: match.timestamp,
          emailed: false,
          hitlQueued: false,
          processedByLearningAgent: false,
        }).onConflictDoNothing();

        rows.push({
          id,
          sourceId: source.id,
          title: `Message from ${match.author ?? 'unknown'}`,
          url,
          content: match.content,
          aiSummary: null,
          publishedAt: match.timestamp,
          emailed: false,
          hitlQueued: false,
          hitlRecordId: null,
          processedByLearningAgent: false,
          createdAt: now,
        });
      }
      await db
        .update(schema.trackedSources)
        .set({ lastCheckedAt: now, updatedAt: now })
        .where(eq(schema.trackedSources.id, source.id));
      return rows;
    }

    case 'web_search': {
      const results = await executeWebSearch(
        { env: (agent as any).env, ctx: (agent as any).ctx },
        source.id,
        source.queryOrUrl,
        (source.metadata as any)?.maxResults ?? 10,
      );
      const rows: TrackedItemRow[] = [];
      for (const r of results) {
        const existing = await db
          .select({ id: schema.trackedItems.id })
          .from(schema.trackedItems)
          .where(eq(schema.trackedItems.url, r.url))
          .limit(1);
        if (existing.length > 0) continue;

        const id = crypto.randomUUID();
        await db.insert(schema.trackedItems).values({
          id,
          sourceId: source.id,
          title: r.title,
          url: r.url,
          content: r.snippet,
          emailed: false,
          hitlQueued: false,
          processedByLearningAgent: false,
        }).onConflictDoNothing();

        rows.push({
          id,
          sourceId: source.id,
          title: r.title,
          url: r.url,
          content: r.snippet,
          aiSummary: null,
          publishedAt: null,
          emailed: false,
          hitlQueued: false,
          hitlRecordId: null,
          processedByLearningAgent: false,
          createdAt: now,
        });
      }
      await db
        .update(schema.trackedSources)
        .set({ lastCheckedAt: now, updatedAt: now })
        .where(eq(schema.trackedSources.id, source.id));
      return rows;
    }

    default:
      throw new Error(`Unknown source type: ${source.type}`);
  }
}
