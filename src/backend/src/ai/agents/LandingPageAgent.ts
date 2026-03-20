/**
 * @file UIFrameworkAgent.ts
 * @description UI Framework Planning Agent — dispatches a Jules session to generate
 * a comprehensive Astro + Shadcn + dark-theme framework implementation plan for a
 * target repository, then hands off to JulesOverseer for PR submission.
 *
 * Replaces the previous LandingPageAgent. The old LandingPageRefinementSchema
 * and direct refinement logic are preserved as a secondary capability.
 *
 * Skills applied: copywriting, frontend-design, react-best-practices
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { createAgent } from '@/ai/agents/honi';
import { buildMaxAgentMemory } from '@/ai/agents/memory';
import { getDb } from '@db';
import { julesJobs } from '@db/schemas/jules';
import { JulesService } from '@/services/jules/service';
import { buildSkillContext } from '@services/octokit/skill-fetcher';

// ---------------------------------------------------------------------------
// Schema — kept for backward compat with existing landing-generator routes
// ---------------------------------------------------------------------------

export const LandingPageRefinementSchema = z.object({
  purpose: z.object({
    headline: z.string().optional(),
    tagline: z.string().optional(),
    valueStatement: z.string().optional(),
  }).optional(),
  branding: z.any().optional(),
  painPoints: z.array(z.object({
    title: z.string(),
    description: z.string(),
    solution: z.string(),
  })).optional(),
  metrics: z.array(z.object({
    value: z.string(),
    label: z.string(),
    trend: z.enum(['positive', 'neutral', 'negative']).optional(),
  })).optional(),
}).passthrough();

export type LandingPageRefinementResponse = z.infer<typeof LandingPageRefinementSchema>;

// ---------------------------------------------------------------------------
// Jules framework plan — the ordered list of sub-tasks
// ---------------------------------------------------------------------------

const UI_FRAMEWORK_PLAN = `
You are implementing a full-featured Astro + Shadcn UI dark-theme frontend for the repository.

## Source Repository
https://github.com/jmbish04/core-template-cfw-assets-astro-shadcn

## Implementation Plan (execute in order — each step is a PR-ready unit of work)

### Phase 1: Landing Page
- Fill in the landing page (src/pages/index.astro) covering all product features
- Hero section, feature grid, social proof, CTA
- Use shadcn/ui Card, Button, Badge components
- Dark theme from layouts/BaseLayout.astro — do NOT add a light toggle

### Phase 2: Docs Multipage Center
- Each section = its own dedicated page at /docs/{section}/
- Corresponding JSX file at src/components/docs/{Section}Doc.tsx
- Sidebar within /docs/ auto-generated from page list
- Sections minimum: Getting Started, Architecture, API Reference, Agents, Deployment

### Phase 3: Sidebar Navigation (Global)
- Dynamic sidebar available on ALL pages
- Reads page manifest from src/lib/nav.ts — add every page to this file
- Uses shadcn/ui NavigationMenu or Sheet on mobile

### Phase 4: AI Chat (assistant-ui + Honi + AI Gateway)
- Install assistant-ui: pnpm add @assistant-ui/react --filter frontend
- Wire to backend honi agent via WebSocket at /api/agents/chat
- Route through AI Gateway (existing aiGatewaySlug: 'core-github-api')
- Add /chat route with dedicated page

### Phase 5: Health Page
- Create /health page mirroring the health dashboard from core-github-api
- Backend: GET /api/health returns { services: SystemServiceStatus[] }
- Schema: services table with columns (id, name, status, last_checked, message)
- Use shadcn/ui Table + Badge (green/yellow/red) for display

### Phase 6: OpenAPI + API Docs
- Serve /openapi.json (OpenAPI v3.1.0) with operationId on all methods — generated dynamically from the Hono RPC AppType
- Mount /swagger → swagger-ui-dist static serve
- Mount /scalar → @scalar/hono-api-reference middleware
- Add all three to the global sidebar nav

## Rules
- Use pnpm with --filter frontend for all frontend deps
- No placeholder content — generate real, meaningful copy
- All components use Shadcn (no raw Tailwind div-soup)
- TypeScript strict mode throughout
- Submit a single PR per phase with a clear title and description
`.trim();

// ---------------------------------------------------------------------------
// Honi agent runtime (kept for direct chat interactions)
// ---------------------------------------------------------------------------

export const { Agent, handler } = createAgent<Env>({
  name: 'ui-framework',
  model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  system: [
    'You are the UI Framework Agent — an expert in Astro, React, shadcn/ui, and Cloudflare Workers.',
    'You either refine landing page configurations (JSON output) or dispatch Jules to implement frontend tasks.',
    '',
    '## Skills applied',
    '- **copywriting**: Sharp, benefit-led headlines and CTAs. No filler.',
    '- **frontend-design**: Visual hierarchy, OKLCH color theory, glassmorphism patterns for dark UIs.',
    '- **react-best-practices**: RSC awareness, server vs client component boundaries, bundle-size discipline.',
    '- **clean-code**: TypeScript strict mode, self-documenting code, Zod schemas for all IO.',
  ].join('\n'),
  binding: 'UI_FRAMEWORK_AGENT',
  tools: [],
  memory: buildMaxAgentMemory({
    agentName: 'UIFrameworkAgent',
    graphId: 'core-github-api-ui-framework',
  }),
  observability: { enabled: true, aiGatewaySlug: 'core-github-api', collectEvents: true },
});

// ---------------------------------------------------------------------------
// Jules dispatch — creates a plan session and registers a jules_job
// ---------------------------------------------------------------------------

export async function dispatchUIFrameworkPlan(
  env: Env,
  targetRepo: string = 'jmbish04/core-template-cfw-assets-astro-shadcn',
): Promise<{ sessionId: string }> {
  const julesService = JulesService.getInstance(env);

  // Parse "owner/repo" → individual fields required by StartSessionParams
  const [repoOwner, repoName] = targetRepo.split('/');
  if (!repoOwner || !repoName) {
    throw new Error(`Invalid targetRepo format: '${targetRepo}'. Expected 'owner/repo'.`);
  }

  // Build dynamic skill context and prepend to plan
  const skillCtx = await buildSkillContext(env as any, 'UIFrameworkAgent');
  const fullPrompt = skillCtx
    ? `${skillCtx}\n\n${UI_FRAMEWORK_PLAN}\n\nTarget repository: ${targetRepo}`
    : `${UI_FRAMEWORK_PLAN}\n\nTarget repository: ${targetRepo}`;

  // Start the Jules session — JulesService handles D1 session persistence automatically
  const session = await julesService.startSession({
    prompt: fullPrompt,
    repo: {
      owner: repoOwner,
      repo: repoName,
      branch: 'feat/ui-framework-auto',
    },
    agentId: 'UIFrameworkAgent',
    specialistClass: 'UIFrameworkAgent',
    sessionRole: 'implementation',
    autoPr: true,
  });

  const sessionId: string = session.id ?? crypto.randomUUID();

  // Insert a jules_job row — JulesOverseer cron picks this up automatically
  // julesJobs.id is autoIncrement, do NOT pass it explicitly
  const db = getDb(env.DB);
  await db.insert(julesJobs).values({
    sessionId,
    repoFullName: targetRepo,
    prompt: fullPrompt.slice(0, 2000),
    status: 'pending',
  }).run();

  return { sessionId };
}

// ---------------------------------------------------------------------------
// Hono router
// ---------------------------------------------------------------------------

const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => c.json({ status: 'ok', agent: 'UIFrameworkAgent' }));
app.get('/docs', (c) => c.text('UI Framework Agent — dispatches Jules to build your frontend framework.'));
app.get('/context', (c) => c.json({ environment: 'Cloudflare Workers', agent: 'UIFrameworkAgent' }));
app.get('/openapi.json', (c) =>
  c.json({ openapi: '3.1.0', info: { title: 'UIFrameworkAgent', version: '1.0.0' }, paths: {} })
);

/** POST /dispatch — triggers the Jules UI framework plan for a target repo */
app.post('/dispatch', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const targetRepo = body?.targetRepo ?? 'jmbish04/core-template-cfw-assets-astro-shadcn';
  const result = await dispatchUIFrameworkPlan(c.env, targetRepo);
  return c.json({ success: true, ...result }, 201);
});

app.all('/*', (c) => handler.fetch(c.req.raw, c.env, c.executionCtx));

export default app;

/** Durable Object export — required by wrangler for the 'UI_FRAMEWORK_AGENT' binding */
export class UIFrameworkAgent extends Agent {}

/**
 * @deprecated Use UIFrameworkAgent. Kept for backward compat with any existing
 * imports of LandingPageAgent.
 */
export { UIFrameworkAgent as LandingPageAgent };
