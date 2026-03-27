import type { Context } from 'hono';
import { getDb, schema } from '@db';
import { v4 as uuidv4 } from 'uuid';

/**
 * [INGEST] POST /api/frontend/daily-research/ingest
 * Receives the payload from the GitHub Action Research Judge.
 * After persisting the research doc, it fires the CloudflareChangelogWorkflow
 * asynchronously so fresh RSS entries are ingested in parallel.
 */
export const dailyResearchIngestHandler = async (c: Context) => {
    try {
        const body = await c.req.json();
        const { prompt, status, judge_notes, findings } = body;

        if (!prompt || !status || !findings) {
            return c.json({ error: 'Missing required fields' }, 400);
        }

        const db = getDb(c.env.DB);
        const id = uuidv4();
        const date = new Date().toISOString().split('T')[0];

        await db.insert(schema.dailyResearchDocs).values({
            id,
            date,
            prompt,
            status,
            judgeNotes: judge_notes || '',
            findings: JSON.stringify(findings),
        });

        console.log(`[DailyResearch] Ingested research doc ${id} for date ${date}`);

        // ── Fire Cloudflare Changelog ingestion workflow (fire-and-forget) ──
        // This is non-blocking: the workflow runs durably via Cloudflare Workflows
        // and will not affect the response time or outcome of this HTTP handler.
        try {
            await c.env.CLOUDFLARE_CHANGELOG_WORKFLOW.create({
                id: `cf-changelog-${date}-${uuidv4().slice(0, 8)}`,
                params: {},
            });
            console.log('[DailyResearch] Spawned CloudflareChangelogWorkflow');
        } catch (workflowErr: any) {
            // Non-fatal: log and continue regardless of workflow creation failure
            console.warn('[DailyResearch] Failed to spawn CloudflareChangelogWorkflow:', workflowErr.message);
        }

        return c.json({ success: true, id });
    } catch (e: any) {
        console.error('[DailyResearch] Ingest error:', e);
        return c.json({ error: e.message }, 500);
    }
};
