
import type { Context } from 'hono';
import { getDb, schema } from '@db';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST /upsert/daily-research
 * Receives the payload from the GitHub Action Research Judge
 */
export const dailyResearchHandler = async (c: Context) => {
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

        console.log(`[DailyResearch] Upserted research doc ${id} for date ${date}`);

        return c.json({ success: true, id });
    } catch (e: any) {
        console.error('[DailyResearch] Error upserting research doc:', e);
        return c.json({ error: e.message }, 500);
    }
};
