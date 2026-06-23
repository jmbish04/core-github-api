/**
 * @file ResearchAgent/methods/rss/index.ts
 * @description RSS feed polling and ingestion for the ResearchAgent.
 *              Uses fast-xml-parser (already in package.json) to fetch and
 *              parse generic XML/RSS feeds, deduplicates against tracked_items,
 *              and AI-summarizes new entries.
 */

import { getDb, schema } from '@db';
import { eq, inArray } from 'drizzle-orm';
import type { ResearchAgent } from '../../index';
import type { TrackedSourceRow, TrackedItemRow, NewTrackedItemRow } from '@db/schemas/agents/research-tracking';

// ---------------------------------------------------------------------------
// Stack-relevance keywords (applied to Cloudflare-specific feeds)
// ---------------------------------------------------------------------------

const CF_RELEVANT_KEYWORDS = [
  'workers', 'worker', 'ai', 'd1', 'r2', 'kv',
  'durable objects', 'durable object', 'vectorize',
  'queues', 'queue', 'pages', 'ai gateway',
  'workers ai', 'hyperdrive', 'workflows', 'agents sdk',
];

function isStackRelevant(title: string, description: string): boolean {
  const haystack = `${title} ${description}`.toLowerCase();
  return CF_RELEVANT_KEYWORDS.some((kw) => haystack.includes(kw));
}

// ---------------------------------------------------------------------------
// RSS item shape (fast-xml-parser output)
// ---------------------------------------------------------------------------

interface RssItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  guid?: string | { '#text': string; '@_isPermaLink'?: string };
}

// ---------------------------------------------------------------------------
// Poll a single RSS feed and persist new items
// ---------------------------------------------------------------------------

export async function pollRSSFeed(
  agent: ResearchAgent,
  source: TrackedSourceRow,
): Promise<{ newCount: number; items: TrackedItemRow[] }> {
  const logger = (agent as any).logger;
  const logPrefix = `[RSS:${source.name}]`;

  logger.info(`${logPrefix} Fetching feed: ${source.queryOrUrl}`);

  // Dynamically import to keep cold-start weight low
  const { XMLParser } = await import('fast-xml-parser');

  const res = await fetch(source.queryOrUrl, {
    headers: { 'User-Agent': 'core-github-api/1.0 (Cloudflare Worker)' },
    cf: { cacheTtl: 300, cacheEverything: false },
  });

  if (!res.ok) {
    throw new Error(`${logPrefix} RSS fetch failed: ${res.status} ${res.statusText}`);
  }

  const xml = await res.text();
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
  });

  const feed = parser.parse(xml);
  const rawItems: RssItem[] = feed?.rss?.channel?.item ?? [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];

  // Extract metadata keywords for CF-specific filtering
  const keywords = (source.metadata as any)?.keywords as string[] | undefined;
  const shouldFilter = keywords && keywords.length > 0;

  const parsed = items
    .filter((item) => {
      if (!shouldFilter) return true;
      return isStackRelevant(item.title ?? '', item.description ?? '');
    })
    .map((item) => {
      let id: string;
      if (typeof item.guid === 'object' && item.guid !== null) {
        id = (item.guid as any)['#text'] ?? item.link ?? item.title;
      } else {
        id = (item.guid as string | undefined) ?? item.link ?? item.title;
      }
      return {
        id: String(id).trim(),
        title: String(item.title ?? '').trim(),
        link: String(item.link ?? '').trim(),
        description: String(item.description ?? '').trim(),
        pubDate: String(item.pubDate ?? '').trim(),
      };
    });

  logger.info(`${logPrefix} Fetched ${items.length} total, ${parsed.length} after filter`);

  if (parsed.length === 0) return { newCount: 0, items: [] };

  // Deduplicate against D1
  const db = getDb((agent as any).env.DB);
  const urls = parsed.map((i) => i.link);
  const existing = await db
    .select({ url: schema.trackedItems.url })
    .from(schema.trackedItems)
    .where(inArray(schema.trackedItems.url, urls));

  const existingUrls = new Set(existing.map((r) => r.url));
  const fresh = parsed.filter((i) => !existingUrls.has(i.link));

  logger.info(`${logPrefix} ${existing.length} already in D1, ${fresh.length} genuinely new`);

  if (fresh.length === 0) return { newCount: 0, items: [] };

  // AI-summarize each new item
  const rows: NewTrackedItemRow[] = [];
  for (const item of fresh) {
    let aiSummary: string | null = null;
    try {
      const systemPrompt =
        'You are a senior platform engineer. ' +
        'Respond with exactly one technically precise sentence summarizing this update. ' +
        'No preamble or trailing punctuation beyond a period.';
      const userPrompt = `Title: ${item.title}\n\nDescription: ${item.description.slice(0, 1500)}`;

      aiSummary = await (agent as any).ai.generateText(
        userPrompt,
        systemPrompt,
        { provider: 'workers-ai', model: '@cf/meta/llama-4-scout-17b-16e-instruct' },
      );
      aiSummary = aiSummary?.split(/(?<=[.!?])\s+/)[0]?.trim() ?? aiSummary?.trim() ?? null;
    } catch (err: any) {
      logger.warn(`${logPrefix} AI summary failed for "${item.title}": ${err.message}`);
    }

    rows.push({
      id: crypto.randomUUID(),
      sourceId: source.id,
      title: item.title,
      url: item.link,
      content: item.description,
      aiSummary,
      publishedAt: item.pubDate,
      emailed: false,
      hitlQueued: false,
      processedByLearningAgent: false,
    });
  }

  // Bulk-insert
  await db.insert(schema.trackedItems).values(rows).onConflictDoNothing();

  // Update source last_checked_at
  await db
    .update(schema.trackedSources)
    .set({ lastCheckedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where(eq(schema.trackedSources.id, source.id));

  logger.info(`${logPrefix} Persisted ${rows.length} new entries`);

  // Re-select so callers get full rows
  const inserted = await db
    .select()
    .from(schema.trackedItems)
    .where(inArray(schema.trackedItems.url, rows.map((r) => r.url)));

  return { newCount: rows.length, items: inserted };
}
