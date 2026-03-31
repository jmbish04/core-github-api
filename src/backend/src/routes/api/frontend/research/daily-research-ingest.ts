import type { Context } from 'hono';
import { getDb, schema } from '@db';
import { v4 as uuidv4 } from 'uuid';

/**
 * [INGEST] POST /api/frontend/daily-research/ingest
 * Receives the payload from the GitHub Action Research Judge
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
            findings: JSON.stringify(findings)
        });

        console.log(`[DailyResearch] Ingested research doc ${id} for date ${date}`);

        return c.json({ success: true, id });
    } catch (e: any) {
        console.error('[DailyResearch] Ingest error:', e);
        return c.json({ error: e.message }, 500);
    }
};
