import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { researchRecommendations } from '@/db/schemas/github/research';
import { eq, desc } from 'drizzle-orm';
import { runDeepResearch } from '@/workflows/research/deep';

import { dailyResearchIngestHandler } from './daily-research-ingest';

const app = new Hono<{ Bindings: any }>();

// Research Ingestion (from Judge)
app.post('/ingest', (c) => dailyResearchIngestHandler(c));

// Get candidates pending human review
app.get('/candidates', async (c) => {
  const db = drizzle(c.env.DB);
  const candidates = await db.select()
    .from(researchRecommendations)
    .where(eq(researchRecommendations.isReviewed, false))
    .orderBy(desc(researchRecommendations.aiScore));
  return c.json(candidates);
});

// Submit Human-in-the-Loop Feedback
app.post('/feedback/:id', async (c) => {
  const id = decodeURIComponent(c.req.param('id'));
  const body = await c.req.json();
  const userRating = body.userRating;
  const userFeedback = body.userFeedback;
  const db = drizzle(c.env.DB);
  
  await db.update(researchRecommendations)
    .set({ humanRating: userRating, humanFeedback: userFeedback, isReviewed: true })
    .where(eq(researchRecommendations.id, id));
    
  return c.json({ success: true });
});

// Trigger ad-hoc research run
app.post('/trigger', async (c) => {
  const body = await c.req.json();
  const topic = body.topic;
  c.executionCtx.waitUntil(runDeepResearch(c.env, topic));
  return c.json({ success: true, message: "Research swarm dispatched in background." });
});

export default app;
