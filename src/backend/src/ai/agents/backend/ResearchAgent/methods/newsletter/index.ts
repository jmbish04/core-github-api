/**
 * @file ResearchAgent/methods/newsletter/index.ts
 * @description Newsletter dispatch for the ResearchAgent.
 *
 * Assembles and sends daily/weekly email digests containing:
 *   1. New Discoveries — unemailed tracked_items grouped by source type
 *   2. Pending HITL Items — research proposals awaiting frontend review
 *   3. Source-specific highlights with AI summaries
 *
 * Leverages existing email infra:
 *   - sendRepoDiscoveryEmail() for Handlebars templates + SEND_EMAIL_NEWSLETTER
 *   - EmailTemplaterService for MIME construction via mimetext
 */

import { getDb, schema } from '@db';
import { eq, and, inArray } from 'drizzle-orm';
import { hitlQueue } from '@/db/schemas/workflows/hitl';
import type { ResearchAgent } from '../../index';

export interface NewsletterResult {
  sent: boolean;
  itemCount: number;
  hitlCount: number;
}

// ---------------------------------------------------------------------------
// Main dispatch
// ---------------------------------------------------------------------------

export async function dispatchNewsletter(
  agent: ResearchAgent,
  mode: 'daily' | 'weekly',
): Promise<NewsletterResult> {
  const logger = (agent as any).logger;
  const env = (agent as any).env;
  const db = getDb(env.DB);

  if (!env.SEND_EMAIL_NEWSLETTER) {
    logger.warn('[newsletter] SEND_EMAIL_NEWSLETTER binding not configured — skipping');
    return { sent: false, itemCount: 0, hitlCount: 0 };
  }

  // 1. Gather unemailed tracked items
  const newItems = await db
    .select({
      id: schema.trackedItems.id,
      title: schema.trackedItems.title,
      url: schema.trackedItems.url,
      aiSummary: schema.trackedItems.aiSummary,
      publishedAt: schema.trackedItems.publishedAt,
      sourceId: schema.trackedItems.sourceId,
    })
    .from(schema.trackedItems)
    .where(eq(schema.trackedItems.emailed, false));

  // Resolve source names for grouping
  const sourceIds = [...new Set(newItems.map((i) => i.sourceId))];
  const sourceRows = sourceIds.length > 0
    ? await db
        .select({ id: schema.trackedSources.id, name: schema.trackedSources.name, type: schema.trackedSources.type })
        .from(schema.trackedSources)
        .where(inArray(schema.trackedSources.id, sourceIds))
    : [];
  const sourceMap = new Map(sourceRows.map((s) => [s.id, s]));

  // Group items by source
  const grouped: Record<string, typeof newItems> = {};
  for (const item of newItems) {
    const source = sourceMap.get(item.sourceId);
    const key = source ? `${source.name} (${source.type})` : 'Unknown Source';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  }

  // 2. Gather pending HITL research proposals
  const pendingHitl = await db
    .select()
    .from(hitlQueue)
    .where(
      and(
        eq(hitlQueue.category, 'research_proposal'),
        eq(hitlQueue.status, 'pending'),
      ),
    );

  // 3. Build HTML content
  const baseUrl = (env as any).BASE_URL || 'https://core-github-api.hacolby.app';
  let contentHtml = `<h2>📡 Research Intelligence — ${mode.charAt(0).toUpperCase() + mode.slice(1)} Digest</h2>`;
  contentHtml += `<p style="color:#999;">${new Date().toLocaleDateString()} • ${newItems.length} new discoveries • ${pendingHitl.length} pending proposals</p>`;

  // Section 1: New Discoveries
  if (newItems.length > 0) {
    contentHtml += `<h3>🔍 New Discoveries</h3>`;
    for (const [sourceName, items] of Object.entries(grouped)) {
      contentHtml += `<h4>${sourceName} (${items.length})</h4><ul>`;
      for (const item of items.slice(0, 10)) {
        contentHtml += `<li><a href="${item.url}">${item.title}</a>`;
        if (item.aiSummary) contentHtml += `<br/><em style="color:#888;">${item.aiSummary}</em>`;
        contentHtml += `</li>`;
      }
      if (items.length > 10) {
        contentHtml += `<li><em>...and ${items.length - 10} more</em></li>`;
      }
      contentHtml += `</ul>`;
    }
  } else {
    contentHtml += `<p>No new discoveries this period.</p>`;
  }

  // Section 2: Pending HITL Proposals
  if (pendingHitl.length > 0) {
    contentHtml += `<h3>⚡ Pending HITL Proposals — Action Required</h3>`;
    contentHtml += `<p>The following research proposals are awaiting your review:</p><ul>`;
    for (const record of pendingHitl) {
      const payload = record.proposedPayload as any;
      const reviewUrl = `${baseUrl}/hitl/research-proposals/${record.id}`;
      contentHtml += `<li>`;
      contentHtml += `<a href="${reviewUrl}"><strong>${payload?.title ?? record.entityId}</strong></a>`;
      contentHtml += ` → <code>${record.proposalTarget ?? 'TBD'}</code>`;
      if (payload?.reasoning) {
        contentHtml += `<br/><em style="color:#888;">${String(payload.reasoning).slice(0, 200)}</em>`;
      }
      contentHtml += `</li>`;
    }
    contentHtml += `</ul>`;
  }

  // 4. Send via existing email infrastructure
  const { sendRepoDiscoveryEmail } = await import('@/utils/email/send/repo-discovery');
  const dateStr = new Date().toLocaleDateString();

  await sendRepoDiscoveryEmail(env, {
    subject: `[${mode.toUpperCase()}] Research Intelligence — ${dateStr}`,
    title: `Research Intelligence — ${mode.charAt(0).toUpperCase() + mode.slice(1)} Digest`,
    contentHtml,
    plainTextFallback: `${newItems.length} new discoveries, ${pendingHitl.length} pending HITL proposals. View at ${baseUrl}/research`,
  });

  // 5. Mark items as emailed
  if (newItems.length > 0) {
    const ids = newItems.map((i) => i.id);
    // Batch update in chunks to stay under SQLite variable limits
    const chunkSize = 50;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      await db
        .update(schema.trackedItems)
        .set({ emailed: true })
        .where(inArray(schema.trackedItems.id, chunk));
    }
  }

  logger.info(`[newsletter] ${mode} newsletter sent: ${newItems.length} items, ${pendingHitl.length} HITL`);
  return { sent: true, itemCount: newItems.length, hitlCount: pendingHitl.length };
}
