/**
 * @file workflows/research/cloudflare-changelog.ts
 * @description Cloudflare Changelog RSS ingestion workflow.
 *
 * Pipeline (4 durable steps):
 *   1. fetch-rss       — Fetch & parse the Cloudflare changelog RSS feed
 *   2. deduplicate     — Remove entries already in D1
 *   3. ai-summarize    — Generate a 1-sentence technical summary via AI Gateway
 *   4. persist         — Bulk-insert new rows into cloudflare_changelog table
 */

import { WorkflowEntrypoint, type WorkflowStep, type WorkflowEvent } from 'cloudflare:workers';
import { getDb, schema } from '@db';
import { inArray } from 'drizzle-orm';
import { AIGateway } from '@/ai/utils/ai-gateway';

// ---------------------------------------------------------------------------
// Stack-relevant keyword filter
// ---------------------------------------------------------------------------
const RELEVANT_KEYWORDS = [
  'workers',
  'worker',
  'ai',
  'd1',
  'r2',
  'kv',
  'durable objects',
  'durable object',
  'vectorize',
  'queues',
  'queue',
  'pages',
  'ai gateway',
  'workers ai',
  'hyperdrive',
  'workflows',
];

function isStackRelevant(title: string, description: string): boolean {
  const haystack = `${title} ${description}`.toLowerCase();
  return RELEVANT_KEYWORDS.some((kw) => haystack.includes(kw));
}

// ---------------------------------------------------------------------------
// Lightweight RSS item shape (fast-xml-parser output)
// ---------------------------------------------------------------------------
interface RssItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  guid?: string | { '#text': string; '@_isPermaLink'?: string };
}

interface ParsedFeed {
  newItems: Array<{
    id: string;
    title: string;
    link: string;
    description: string;
    pubDate: string;
  }>;
}

interface SummarizedItem {
  id: string;
  title: string;
  link: string;
  description: string;
  aiSummary: string | null;
  pubDate: string;
}

// ---------------------------------------------------------------------------
// Workflow input payload type
// ---------------------------------------------------------------------------
export interface CloudflareChangelogPayload {
  /** Optional: override feed URL for testing */
  feedUrl?: string;
}

// ---------------------------------------------------------------------------
// Workflow class
// ---------------------------------------------------------------------------
export class CloudflareChangelogWorkflow extends WorkflowEntrypoint<Env, CloudflareChangelogPayload> {
  async run(event: WorkflowEvent<CloudflareChangelogPayload>, step: WorkflowStep): Promise<void> {
    const feedUrl = event.payload?.feedUrl ?? 'https://developers.cloudflare.com/changelog/index.xml';

    // ------------------------------------------------------------------
    // Step 1: Fetch & parse RSS feed
    // ------------------------------------------------------------------
    const parsed = await step.do<ParsedFeed>('fetch-rss', async () => {
      // Dynamically import to keep cold-start weight low
      const { XMLParser } = await import('fast-xml-parser');

      const res = await fetch(feedUrl, {
        headers: { 'User-Agent': 'core-github-api/1.0 (Cloudflare Worker)' },
        cf: { cacheTtl: 300, cacheEverything: false },
      });

      if (!res.ok) {
        throw new Error(`[CF-Changelog] RSS fetch failed: ${res.status} ${res.statusText}`);
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

      const filteredItems = items
        .filter((item) => isStackRelevant(item.title ?? '', item.description ?? ''))
        .map((item) => {
          // guid can be a string or an object with #text
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

      console.log(
        `[CF-Changelog] Fetched ${items.length} total items, ${filteredItems.length} stack-relevant`,
      );

      return { newItems: filteredItems };
    });

    if (parsed.newItems.length === 0) {
      console.log('[CF-Changelog] No relevant items found — workflow complete.');
      return;
    }

    // ------------------------------------------------------------------
    // Step 2: Deduplicate against D1
    // ------------------------------------------------------------------
    const newOnly = await step.do<ParsedFeed['newItems']>('deduplicate', async () => {
      const db = getDb(this.env.DB);
      const ids = parsed.newItems.map((i) => i.id);

      const existing = await db
        .select({ id: schema.cloudflareChangelog.id })
        .from(schema.cloudflareChangelog)
        .where(inArray(schema.cloudflareChangelog.id, ids));

      const existingIds = new Set(existing.map((r) => r.id));
      const fresh = parsed.newItems.filter((i) => !existingIds.has(i.id));

      console.log(
        `[CF-Changelog] ${existing.length} already in D1, ${fresh.length} genuinely new`,
      );
      return fresh;
    });

    if (newOnly.length === 0) {
      console.log('[CF-Changelog] All items already persisted — workflow complete.');
      return;
    }

    // ------------------------------------------------------------------
    // Step 3: AI-summarize each new item
    // ------------------------------------------------------------------
    const summarized = await step.do<SummarizedItem[]>('ai-summarize', async () => {
      const results: SummarizedItem[] = [];

      for (const item of newOnly) {
        let aiSummary: string | null = null;

        try {
          const systemPrompt =
            'You are a senior Cloudflare platform engineer. ' +
            'Respond with exactly one technically precise sentence summarizing the changelog update. ' +
            'Do not include any preamble or trailing punctuation beyond a period.';

          const userPrompt =
            `Title: ${item.title}\n\n` +
            `Description: ${item.description.slice(0, 1500)}`; // Guard against huge descriptions

          aiSummary = await AIGateway.runTextWithFallback(
            this.env,
            'openai',
            'gpt-4o-mini',
            systemPrompt,
            userPrompt,
          );

          // Trim to a single sentence as a safety measure
          aiSummary = aiSummary.split(/(?<=[.!?])\s+/)[0]?.trim() ?? aiSummary.trim();
        } catch (err: any) {
          console.warn(`[CF-Changelog] AI summary failed for "${item.title}": ${err.message}`);
          // Proceed without summary rather than failing the whole workflow
        }

        results.push({ ...item, aiSummary });
      }

      return results;
    });

    // ------------------------------------------------------------------
    // Step 4: Persist to D1
    // ------------------------------------------------------------------
    await step.do<void>('persist', async () => {
      const db = getDb(this.env.DB);

      const rows = summarized.map((item) => ({
        id: item.id,
        title: item.title,
        link: item.link,
        description: item.description,
        aiSummary: item.aiSummary ?? null,
        pubDate: item.pubDate,
        emailed: false,
      }));

      // Insert in a single batch; ignore conflicts on PK in case of concurrent runs
      await db
        .insert(schema.cloudflareChangelog)
        .values(rows)
        .onConflictDoNothing();

      console.log(`[CF-Changelog] Persisted ${rows.length} new entries to D1.`);
    });
  }
}
