// src/routes/api/timeline.ts
import { Hono } from 'hono';
import { Bindings } from '@utils/hono';
import { getDb } from '@db';
import { agentActivities } from '@db/schema';
import { eq } from 'drizzle-orm';
import { generateUuid } from "@/utils/common";

const timelineApi = new Hono<{ Bindings: Env }>();

// GET /api/ops/:operationId/timeline
timelineApi.get('/ops/:operationId/timeline', async (c) => {
    const { operationId } = c.req.param();
    const db = getDb(c.env.DB);
    const rows = await db.select().from(agentActivities).where(eq(agentActivities.operationId, operationId));
    return c.json({ success: true, timeline: rows });
});

// POST /api/ops/:operationId/timeline (For agent emissions)
timelineApi.post('/ops/:operationId/timeline', async (c) => {
    const { operationId } = c.req.param();
    const body = await c.req.json();
    const { step, status, details } = body as any;
    const db = getDb(c.env.DB);

    await db.insert(agentActivities).values({
        id: generateUuid(),
        operationId,
        stepName: step,
        status,
        details: typeof details === 'string' ? details : JSON.stringify(details),
        timestamp: new Date().toISOString()
    });

    return c.json({ success: true });
});

export default timelineApi;
