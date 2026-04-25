/**
 * @file EngineerAgent/methods/landing-page.ts
 * @description Absorbed from LandingPageAgent.ts (UIFrameworkAgent) — dispatches
 *              Jules sessions to generate Astro + Shadcn UI frontends for target repos.
 *              Pure functions with DI.
 */
import { z } from "zod";
import { getDb } from "@db";
import { julesJobs } from "@db/schemas/jules";
import { JulesService } from "@/services/jules/service";

import {
  runStructuredChat,
  type StructuredChatResult,
  type AIProvider,
  type AgentStateStore,
  type StructuredChatState,
} from '@/ai/providers';

// ── Schema (backward compat) ──────────────────────────────────────────
export const LandingPageRefinementSchema = z
  .object({
    purpose: z
      .object({
        headline: z.string().optional(),
        tagline: z.string().optional(),
        valueStatement: z.string().optional(),
      })
      .optional(),
    branding: z.any().optional(),
    painPoints: z
      .array(
        z.object({
          title: z.string(),
          description: z.string(),
          solution: z.string(),
        }),
      )
      .optional(),
    metrics: z
      .array(
        z.object({
          value: z.string(),
          label: z.string(),
          trend: z.enum(["positive", "neutral", "negative"]).optional(),
        }),
      )
      .optional(),
  })
  .passthrough();

export type LandingPageRefinementResponse = z.infer<typeof LandingPageRefinementSchema>;

// ── UI Framework Plan ──────────────────────────────────────────────────
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

### Phase 4: AI Chat (assistant-ui + Agents SDK + AI Gateway)
- Install assistant-ui: pnpm add @assistant-ui/react --filter frontend
- Wire to backend agent via WebSocket at /api/agents/chat
- Route through AI Gateway (existing aiGatewaySlug: 'core-github-api')
- Add /chat route with dedicated page

### Phase 5: Health Page
- Create /health page mirroring the health dashboard from core-github-api
- Backend: GET /api/health returns { services: SystemServiceStatus[] }
- Schema: services table with columns (id, name, status, last_checked, message)
- Use shadcn/ui Table + Badge (green/yellow/red) for display

### Phase 6: OpenAPI + API Docs
- Serve /openapi.json (OpenAPI v3.1.0) with operationId on all methods
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

const SYSTEM_PROMPT = [
  "You are the UI Framework Agent — an expert in Astro, React, shadcn/ui, and Cloudflare Workers.",
  "You either refine landing page configurations (JSON output) or dispatch Jules to implement frontend tasks.",
  "",
  "## Skills applied",
  "- **copywriting**: Sharp, benefit-led headlines and CTAs. No filler.",
  "- **frontend-design**: Visual hierarchy, OKLCH color theory, glassmorphism patterns for dark UIs.",
  "- **react-best-practices**: RSC awareness, server vs client component boundaries, bundle-size discipline.",
  "- **clean-code**: TypeScript strict mode, self-documenting code, Zod schemas for all IO.",
].join("\n");

// ── Types ──────────────────────────────────────────────────────────────
type LandingPageDeps = {
  ai: AIProvider;
  store: AgentStateStore<StructuredChatState>;
  env: Env;
};

// ── Methods ────────────────────────────────────────────────────────────

export async function dispatchUIFrameworkPlan(
  deps: LandingPageDeps,
  targetRepo = "jmbish04/core-template-cfw-assets-astro-shadcn",
): Promise<{ sessionId: string }> {
  const julesService = JulesService.getInstance(deps.env);

  const [repoOwner, repoName] = targetRepo.split("/");
  if (!repoOwner || !repoName) {
    throw new Error(`Invalid targetRepo format: '${targetRepo}'. Expected 'owner/repo'.`);
  }

  const fullPrompt = `${UI_FRAMEWORK_PLAN}\n\nTarget repository: ${targetRepo}`;

  const session = await julesService.startSession({
    prompt: fullPrompt,
    repo: {
      owner: repoOwner,
      repo: repoName,
      branch: "feat/ui-framework-auto",
    },
    agentId: "UIFrameworkAgent",
    specialistClass: "UIFrameworkAgent",
    sessionRole: "implementation",
    autoPr: true,
  });

  const sessionId: string = session.id ?? crypto.randomUUID();

  const db = getDb(deps.env.DB);
  await db
    .insert(julesJobs)
    .values({
      sessionId,
      repoFullName: targetRepo,
      prompt: fullPrompt.slice(0, 2000),
      status: "pending",
    })
    .run();

  return { sessionId };
}

export async function chatLandingPage(
  deps: LandingPageDeps,
  message: string,
  history: unknown[] = [],
  context?: unknown,
  source = "api",
  sessionId = "default",
  requestedModel?: string,
): Promise<StructuredChatResult> {
  return runStructuredChat({
    ai: deps.ai,
    store: deps.store,
    agentName: "UIFrameworkAgent",
    systemPrompt: SYSTEM_PROMPT,
    message,
    history,
    context,
    source,
    sessionId,
    requestedModel,
  });
}
