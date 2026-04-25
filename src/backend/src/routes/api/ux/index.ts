/**
 * @file src/routes/api/ux/index.ts
 * @description Hono routes for the UX Design Agent pipeline.
 *
 * Routes:
 *   POST /api/ux/run              — Start a new UX design run
 *   GET  /api/ux/run/:runId       — Get full run state
 *   GET  /api/ux/run/:runId/stream — SSE event stream
 *   GET  /api/ux/runs             — List all runs
 *   DELETE /api/ux/run/:runId     — Cancel a run (best-effort)
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getAgentByName } from 'agents';
import { getDb, workshopUxRuns, workshopUxPages } from '@db';
import { eq, desc } from 'drizzle-orm';



const app = new Hono<{ Bindings: Env }>();

// ─── POST /run — Start a new UX design pipeline run ───────────────────────

const startRunSchema = z.object({
  prompt: z.string().min(10, 'UX prompt must be at least 10 characters'),
  repoOwner: z.string().min(1),
  repoName: z.string().min(1),
  projectName: z.string().optional(),
});

app.post('/run', zValidator('json', startRunSchema), async (c) => {
  const { prompt, repoOwner, repoName } = c.req.valid('json');
  const db = getDb(c.env.DB);

  const runId = crypto.randomUUID();

  // Create the D1 record first
  await db.insert(workshopUxRuns).values({
    id: runId,
    repoOwner,
    repoName,
    originalPrompt: prompt,
    status: 'idle',
    phase: 'idle',
  });

  // Forward to the DO to start the pipeline via direct RPC
  const agent = await getAgentByName<Env>(c.env.DESIGN_AGENT as any, runId);
  try {
    await (agent as any).startPipeline({ runId, repoOwner, repoName, originalPrompt: prompt });
    return c.json({ success: true, runId }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ─── GET /run/:runId — Get run state + pages ──────────────────────────────

app.get('/run/:runId', async (c) => {
  const { runId } = c.req.param();
  const db = getDb(c.env.DB);

  const [run] = await db.select().from(workshopUxRuns).where(eq(workshopUxRuns.id, runId)).limit(1);
  if (!run) return c.json({ error: 'Run not found' }, 404);

  const pages = await db.select().from(workshopUxPages).where(eq(workshopUxPages.runId, runId));

  return c.json({ success: true, run, pages });
});

// ─── GET /run/:runId/stream — SSE stream ──────────────────────────────────

app.get('/run/:runId/stream', async (c) => {
  const { runId } = c.req.param();

  // Legacy HTTP-SSE proxy for browser EventSource clients.
  // Prefer @callable({ streaming: true }) streamPipeline() for RPC consumers.
  const agent = await getAgentByName(c.env.DESIGN_AGENT as any, runId);
  const doResponse = await agent.fetch(new Request("http://agent/stream", {
    headers: { 'Accept': 'text/event-stream' },
  }));

  return new Response(doResponse.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    },
  });
});

// ─── GET /runs — List all runs (most recent first) ────────────────────────

app.get('/runs', async (c) => {
  const db = getDb(c.env.DB);
  const runs = await db.select().from(workshopUxRuns).orderBy(desc(workshopUxRuns.createdAt)).limit(50);
  return c.json({ success: true, runs });
});

// ─── DELETE /run/:runId — Cancel a run (best-effort) ─────────────────────

app.delete('/run/:runId', async (c) => {
  const { runId } = c.req.param();
  const db = getDb(c.env.DB);

  await db
    .update(workshopUxRuns)
    .set({ status: 'error', error: 'Cancelled by user', phase: 'error' })
    .where(eq(workshopUxRuns.id, runId));

  return c.json({ success: true, message: 'Run cancelled' });
});

export default app;
