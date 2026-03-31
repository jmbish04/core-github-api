/**
 * @file src/backend/src/routes/api/docs/agents.ts
 * @description Hono routes for the Colony agent registry.
 *
 * Routes:
 *   GET    /api/docs/agents         — List all active agents (sorted)
 *   GET    /api/docs/agents/:id     — Get a single agent by ID
 *   POST   /api/docs/agents         — Create / upsert an agent entry
 *   PATCH  /api/docs/agents/:id     — Update fields on an agent
 *   DELETE /api/docs/agents/:id     — Soft-delete (sets is_active = false)
 *   POST   /api/docs/agents/seed    — Seed the DB with defaults (idempotent)
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getDb, docsAgents } from '@db';
import { eq, asc } from 'drizzle-orm';

const app = new Hono<{ Bindings: Env }>();

// ─── Zod schemas ────────────────────────────────────────────────────────────

const agentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string()).default([]),
  iconName: z.string().default('Sparkles'),
  iconBg: z.string().default('bg-indigo-500/10 border border-indigo-500/20'),
  iconColor: z.string().default('text-indigo-400'),
  workshopUrl: z.string().optional(),
  docsSlug: z.string().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

const patchSchema = agentSchema.partial().omit({ id: true });

// ─── Helper ─────────────────────────────────────────────────────────────────

function parseAgent(row: typeof docsAgents.$inferSelect) {
  return {
    ...row,
    tags: (() => {
      try { return JSON.parse(row.tags); } catch { return []; }
    })(),
  };
}

// ─── GET /api/docs/agents ───────────────────────────────────────────────────

app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(docsAgents)
    .where(eq(docsAgents.isActive, true))
    .orderBy(asc(docsAgents.sortOrder));

  return c.json({ agents: rows.map(parseAgent) });
});

// ─── GET /api/docs/agents/:id ───────────────────────────────────────────────

app.get('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const [row] = await db
    .select()
    .from(docsAgents)
    .where(eq(docsAgents.id, c.req.param('id')));

  if (!row) return c.json({ error: 'Agent not found' }, 404);
  return c.json({ agent: parseAgent(row) });
});

// ─── POST /api/docs/agents ──────────────────────────────────────────────────

app.post('/', zValidator('json', agentSchema), async (c) => {
  const body = c.req.valid('json');
  const db = getDb(c.env.DB);

  await db
    .insert(docsAgents)
    .values({ ...body, tags: JSON.stringify(body.tags) })
    .onConflictDoUpdate({
      target: docsAgents.id,
      set: {
        name: body.name,
        description: body.description,
        tags: JSON.stringify(body.tags),
        iconName: body.iconName,
        iconBg: body.iconBg,
        iconColor: body.iconColor,
        workshopUrl: body.workshopUrl,
        docsSlug: body.docsSlug,
        isActive: body.isActive,
        sortOrder: body.sortOrder,
        updatedAt: new Date().toISOString(),
      },
    });

  return c.json({ success: true, id: body.id }, 201);
});

// ─── PATCH /api/docs/agents/:id ─────────────────────────────────────────────

app.patch('/:id', zValidator('json', patchSchema), async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const body = c.req.valid('json');

  const set: Record<string, unknown> = { ...body, updatedAt: new Date().toISOString() };
  if (body.tags) set.tags = JSON.stringify(body.tags);

  await db.update(docsAgents).set(set).where(eq(docsAgents.id, id));
  return c.json({ success: true });
});

// ─── DELETE /api/docs/agents/:id ────────────────────────────────────────────

app.delete('/:id', async (c) => {
  const db = getDb(c.env.DB);
  await db
    .update(docsAgents)
    .set({ isActive: false, updatedAt: new Date().toISOString() })
    .where(eq(docsAgents.id, c.req.param('id')));
  return c.json({ success: true });
});

// ─── POST /api/docs/agents/seed ─────────────────────────────────────────────

const DEFAULT_AGENTS = [
  {
    id: 'ux-design-agent',
    name: 'UX Design Agent',
    description: 'Takes a natural-language UX prompt and autonomously designs every page using Stitch, commits mockups to GitHub, and dispatches a Jules fleet to rebuild each page in Astro + Shadcn UI.',
    tags: ['Jules', 'Stitch', 'Durable Object', 'SSE', 'GitHub'],
    iconName: 'Sparkles',
    iconBg: 'bg-indigo-500/10 border border-indigo-500/20',
    iconColor: 'text-indigo-400',
    workshopUrl: '/workshop',
    docsSlug: 'ux-design-agent',
    sortOrder: 0,
  },
  {
    id: 'jules-overseer',
    name: 'Jules Overseer',
    description: 'Monitors active Jules sessions via Durable Object alarms, detects CI failures by fetching Cloudflare build logs, and auto-remediates by prompting Jules with targeted fix instructions.',
    tags: ['Jules', 'CI/CD', 'Durable Object', 'Cloudflare Builds'],
    iconName: 'Shield',
    iconBg: 'bg-amber-500/10 border border-amber-500/20',
    iconColor: 'text-amber-400',
    docsSlug: 'jules-overseer',
    sortOrder: 1,
  },
  {
    id: 'workshop-agent',
    name: 'Workshop Orchestrator',
    description: 'The primary chat agent in the Agent Workshop. Decomposes project requirements into phased tasks and coordinates specialist agents to build complete Cloudflare Worker applications.',
    tags: ['Honi', 'Cloudflare Agents', 'Chat', 'Planning'],
    iconName: 'Wrench',
    iconBg: 'bg-violet-500/10 border border-violet-500/20',
    iconColor: 'text-violet-400',
    workshopUrl: '/workshop',
    docsSlug: 'workshop-agent',
    sortOrder: 2,
  },
  {
    id: 'deep-research-agent',
    name: 'Deep Research Agent',
    description: 'Performs long-horizon research using Cloudflare Workflows, Vectorize RAG, and Sandbox containers. Clones repos, embeds code, and delivers daily HTML reports via email.',
    tags: ['Workflows', 'Vectorize', 'Sandbox', 'Email'],
    iconName: 'BookOpen',
    iconBg: 'bg-cyan-500/10 border border-cyan-500/20',
    iconColor: 'text-cyan-400',
    docsSlug: 'deep-research-agent',
    sortOrder: 3,
  },
  {
    id: 'planning-orchestrator',
    name: 'Planning Orchestrator',
    description: 'Breaks large engineering tasks into sub-tasks, assigns them to specialist agents, and tracks progress via a Kanban-style D1 schema with real-time frontend updates.',
    tags: ['Multi-Agent', 'D1', 'Planning', 'Tasks'],
    iconName: 'Users',
    iconBg: 'bg-emerald-500/10 border border-emerald-500/20',
    iconColor: 'text-emerald-400',
    docsSlug: 'planning-orchestrator',
    sortOrder: 4,
  },
  {
    id: 'github-standardization-agent',
    name: 'Standardization Agent',
    description: 'Audits GitHub repositories against configurable engineering standards, syncs MCP config and secrets, and logs violations to D1 for frontend review.',
    tags: ['GitHub', 'MCP', 'Standards', 'Automation'],
    iconName: 'Code2',
    iconBg: 'bg-rose-500/10 border border-rose-500/20',
    iconColor: 'text-rose-400',
    docsSlug: 'github-standardization-agent',
    sortOrder: 5,
  },
] as const;

app.post('/seed', async (c) => {
  const db = getDb(c.env.DB);

  for (const agent of DEFAULT_AGENTS) {
    await db
      .insert(docsAgents)
      .values({ ...agent, tags: JSON.stringify(agent.tags), isActive: true })
      .onConflictDoNothing();
  }

  return c.json({ success: true, seeded: DEFAULT_AGENTS.length });
});

export { app as docsAgentsRouter };
