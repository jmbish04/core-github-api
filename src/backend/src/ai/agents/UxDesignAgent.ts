/**
 * @file src/backend/src/ai/agents/UxDesignAgent.ts
 * @description 5-phase UX Design Agent Durable Object.
 *
 * Phase 1: Enhance prompt (Jules repoless)
 * Phase 2: Generate design-md page spec (Jules repoless)
 * Phase 3: Stitch loop — design, AI-review, commit each page (iterative)
 * Phase 4: Jules fleet — 1 session per page rebuilding Astro/Shadcn
 * Phase 5: Done
 */

import type { PersistentAgentState } from '@/ai/agents/support/types';
import { AgentStateStore } from '@/ai/agents/support/state-store';
import { JulesService } from '@/services/jules/service';
import { StitchService } from '@/services/stitch/service';
import { GitHubCommitService } from '@/services/ux/GitHubCommitService';
import { getDb, workshopUxRuns, workshopUxPages } from '@db';
import { eq } from 'drizzle-orm';

// ─── State Types ────────────────────────────────────────────────────────────

export type PhaseKey = 'idle' | 'enhancing' | 'designing' | 'stitch_loop' | 'building' | 'done' | 'error';

export interface UxPageState {
  id: string;
  pageName: string;
  pageTitle: string;
  stitchPageId?: string;
  status: 'pending' | 'designing' | 'review' | 'committed' | 'building' | 'done' | 'error';
  reviewIterations: number;
  reviewScore?: number;
  screenshotUrl?: string;
  githubHtmlPath?: string;
  githubScreenshotPath?: string;
  julesSessionId?: string;
  julesPrUrl?: string;
  stagePrompt?: string;
  error?: string;
}

export interface UxRunState extends PersistentAgentState {
  runId: string;
  repoOwner: string;
  repoName: string;
  originalPrompt: string;
  enhancedPrompt?: string;
  designMd?: string;
  stitchProjectId?: string;
  phase: PhaseKey;
  status: 'idle' | 'running' | 'done' | 'error';
  pages: UxPageState[];
  error?: string;
  // PersistentAgentState requires this
  history: Record<string, unknown>[];
}

// ─── SSE Broadcaster ────────────────────────────────────────────────────────

class SseBroadcaster {
  private controllers: Set<ReadableStreamDefaultController> = new Set();

  addSubscriber(): ReadableStream {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    const keepAlive = setInterval(() => {
      writer.write(new TextEncoder().encode(': keepalive\n\n')).catch(() => {
        clearInterval(keepAlive);
        writer.close().catch(() => {});
      });
    }, 25000);

    readable
      .getReader()
      .closed.finally(() => {
        clearInterval(keepAlive);
        writer.close().catch(() => {});
      })
      .catch(() => {});

    return readable;
  }

  broadcast(event: { type: string; data: unknown }): void {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    const encoded = new TextEncoder().encode(payload);

    const dead = new Set<ReadableStreamDefaultController>();
    for (const ctrl of this.controllers) {
      try {
        ctrl.enqueue(encoded);
      } catch {
        dead.add(ctrl);
      }
    }
    dead.forEach((c) => this.controllers.delete(c));
  }
}

// ─── Main Durable Object ────────────────────────────────────────────────────

export class UxDesignAgent implements DurableObject {
  private readonly store: AgentStateStore<UxRunState>;
  private readonly sse: SseBroadcaster;
  private readonly ctx: DurableObjectState;
  private readonly env: Env;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
    this.sse = new SseBroadcaster();
    this.store = new AgentStateStore<UxRunState>({
      ctx,
      env,
      agentName: 'UxDesignAgent',
      initialState: {
        runId: '',
        repoOwner: '',
        repoName: '',
        originalPrompt: '',
        phase: 'idle',
        status: 'idle',
        pages: [],
        history: [],
      },
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/stream' && request.method === 'GET') {
      return this.handleSseStream();
    }

    if (url.pathname === '/start' && request.method === 'POST') {
      const body = (await request.json()) as {
        runId: string;
        repoOwner: string;
        repoName: string;
        originalPrompt: string;
      };
      // Kick off async — return immediately
      this.ctx.waitUntil(this.runPipeline(body));
      return Response.json({ success: true, runId: body.runId }, { status: 202 });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  // ─── SSE ───────────────────────────────────────────────────────────────────

  private handleSseStream(): Response {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    // Snapshot current state immediately for new subscribers
    const snap = JSON.stringify({ type: 'state_snapshot', data: this.store.state });
    writer.write(new TextEncoder().encode(`data: ${snap}\n\n`)).catch(() => {});

    // Keep alive + broadcast remaining events
    const ctrl = {
      enqueue: (chunk: Uint8Array) => writer.write(chunk).catch(() => {}),
    } as unknown as ReadableStreamDefaultController;
    (this.sse as any).controllers.add(ctrl);

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  private emit(type: string, data: unknown): void {
    this.sse.broadcast({ type, data });
  }

  // ─── State Helpers ─────────────────────────────────────────────────────────

  private async setPhase(phase: PhaseKey): Promise<void> {
    await this.store.patch({ phase } as Partial<UxRunState>);
    this.emit('phase_start', { phase });
  }

  private async updatePage(name: string, update: Partial<UxPageState>): Promise<void> {
    const pages = this.store.state.pages.map((p) =>
      p.pageName === name ? { ...p, ...update } : p,
    );
    await this.store.patch({ pages } as Partial<UxRunState>);
    this.emit('page_update', { pageName: name, ...update });
  }

  // ─── Pipeline ──────────────────────────────────────────────────────────────

  private async runPipeline(params: {
    runId: string;
    repoOwner: string;
    repoName: string;
    originalPrompt: string;
  }): Promise<void> {
    const db = getDb(this.env.DB);
    const jules = JulesService.getInstance(this.env);
    const stitch = await StitchService.getInstance(this.env);
    const github = new GitHubCommitService(this.env.GITHUB_TOKEN as unknown as string);

    await this.store.patch({
      ...params,
      status: 'running',
      phase: 'enhancing',
    } as Partial<UxRunState>);

    try {
      // ── Phase 1: Enhance Prompt ────────────────────────────────────────────
      await this.setPhase('enhancing');

      const enhanceResult = await jules.runRepolessSession(
        `You are a UX strategist. Transform this rough UX idea into a formal design brief.\n\n` +
        `Idea: ${params.originalPrompt}\n\n` +
        `Write enhanced-prompt.md with: personas, goals, page list (name, title, description), ` +
        `design language (dark, Shadcn UI, Tailwind), and accessibility notes.`,
      );

      const enhancedPrompt = enhanceResult.files?.['enhanced-prompt.md'] ?? enhanceResult.agentMessage ?? params.originalPrompt;
      await this.store.patch({ enhancedPrompt } as Partial<UxRunState>);
      this.emit('jules_status', { phase: 'enhancing', status: 'Prompt enhanced', sessionId: null });

      // ── Phase 2: Design-MD ─────────────────────────────────────────────────
      await this.setPhase('designing');

      const designResult = await jules.runRepolessSession(
        `You are a UX lead. Based on this design brief, produce a YAML page spec in design.md.\n\n` +
        `Brief:\n${enhancedPrompt}\n\n` +
        `Format:\npages:\n  - name: snake_case_page_name\n    title: Human Title\n    prompt: "Detailed Stitch design prompt for this page"\n` +
        `Generate a complete spec covering every page mentioned in the brief.`,
      );

      const designMd = designResult.files?.['design.md'] ?? designResult.agentMessage ?? '';
      await this.store.patch({ designMd } as Partial<UxRunState>);

      // Parse pages from YAML spec
      const pages = this.parseDesignMd(designMd);
      await this.store.patch({ pages } as Partial<UxRunState>);
      await db.update(workshopUxRuns).set({ designMd, phase: 'designing' }).where(eq(workshopUxRuns.id, params.runId));
      this.emit('pages_discovered', { pages });

      // ── Phase 3: Stitch Loop ────────────────────────────────────────────────
      await this.setPhase('stitch_loop');

      // Create one Stitch project for this run
      const project = await stitch.createProject(`UX Run ${params.runId.slice(0, 8)}`);
      await this.store.patch({ stitchProjectId: project.projectId } as Partial<UxRunState>);

      for (const page of pages) {
        await this.runStitchPageLoop(page, project.projectId, params, stitch, github, db);
      }

      // ── Phase 4: Jules Fleet ────────────────────────────────────────────────
      await this.setPhase('building');

      const CONCURRENCY = 3;
      const queue = [...this.store.state.pages.filter((p) => p.status === 'committed')];
      const active: Promise<void>[] = [];

      const processPage = async (page: UxPageState): Promise<void> => {
        await this.updatePage(page.pageName, { status: 'building' });
        await this.emit('jules_status', { phase: 'building', pageName: page.pageName, status: 'Starting Jules session…' });

        const prompt = this.buildJulesPagePrompt(page, params);
        try {
          const session = await jules.startSession({
            prompt,
            repo: {
              owner: params.repoOwner,
              repo: params.repoName,
              branch: 'main',
            },
            autoPr: true,
            requireApproval: false,
            agentId: `ux-design-agent-${params.runId}`,
          });

          await this.updatePage(page.pageName, { julesSessionId: session.sessionId, status: 'building' });
          await this.emit('jules_status', { phase: 'building', pageName: page.pageName, status: 'Jules session started', sessionId: session.sessionId });

          // Persist session in DB
          await db.insert(workshopUxPages).values({
            id: crypto.randomUUID(),
            runId: params.runId,
            pageName: page.pageName,
            pageTitle: page.pageTitle,
            status: 'building',
            julesSessionId: session.sessionId,
            reviewIterations: page.reviewIterations ?? 0,
            reviewScore: page.reviewScore ?? null,
            githubHtmlPath: page.githubHtmlPath,
          });

          await this.updatePage(page.pageName, { status: 'done' });
        } catch (err: any) {
          await this.updatePage(page.pageName, { status: 'error', error: err.message });
        }
      };

      while (queue.length > 0 || active.length > 0) {
        while (active.length < CONCURRENCY && queue.length > 0) {
          const page = queue.shift()!;
          const promise = processPage(page).then(() => {
            active.splice(active.indexOf(promise), 1);
          });
          active.push(promise);
        }
        if (active.length > 0) await Promise.race(active);
      }

      // ── Done ────────────────────────────────────────────────────────────────
      await this.store.patch({ phase: 'done', status: 'done' } as Partial<UxRunState>);
      await db.update(workshopUxRuns).set({ status: 'done', phase: 'done' }).where(eq(workshopUxRuns.id, params.runId));
      this.emit('run_complete', { runId: params.runId });
    } catch (err: any) {
      const error = String(err?.message ?? err);
      await this.store.patch({ phase: 'error', status: 'error', error } as Partial<UxRunState>);
      await db.update(workshopUxRuns).set({ status: 'error', error, phase: 'error' }).where(eq(workshopUxRuns.id, params.runId));
      this.emit('run_error', { error });
    }
  }

  // ─── Stitch Loop ───────────────────────────────────────────────────────────

  private async runStitchPageLoop(
    page: UxPageState,
    projectId: string,
    params: { runId: string; repoOwner: string; repoName: string },
    stitch: StitchService,
    github: GitHubCommitService,
    _db: ReturnType<typeof getDb>,
  ): Promise<void> {
    const MAX_ITERATIONS = 3;
    const PASS_SCORE = 7;

    await this.updatePage(page.pageName, { status: 'designing' });

    let screenId: string;
    try {
      const screen = await stitch.generateScreen(projectId, page.stagePrompt ?? page.pageTitle);
      screenId = screen.screenId;
    } catch (err: any) {
      await this.updatePage(page.pageName, { status: 'error', error: err.message });
      return;
    }

    let iteration = 0;
    let score = 0;
    let approved = false;

    while (iteration < MAX_ITERATIONS && !approved) {
      iteration++;
      await this.updatePage(page.pageName, { status: 'review', reviewIterations: iteration });

      // Get screen HTML + screenshot from Stitch
      const screenDetails = await stitch.getScreen(projectId, screenId);
      const html = screenDetails.html ?? '';
      const screenshotUrl = screenDetails.screenshotUrl ?? '';

      // AI review
      const review = await this.evaluateStitchMockup({
        pageName: page.pageTitle,
        html,
        screenshotUrl,
      });

      score = review.score;
      this.emit('page_update', { pageName: page.pageName, status: 'review', iteration, reviewScore: score });

      if (score >= PASS_SCORE) {
        approved = true;
      } else if (iteration < MAX_ITERATIONS) {
        // Edit the screen based on feedback
        await stitch.editScreen(projectId, [screenId], review.improvements.join('. '));
      }
    }

    // Commit to GitHub
    try {
      const screenDetails = await stitch.getScreen(projectId, screenId);

      const commitResult = await github.commitStitchPage({
        owner: params.repoOwner,
        repo: params.repoName,
        stitchProjectId: projectId,
        pageName: page.pageName,
        html: screenDetails.html ?? '<html><body></body></html>',
        screenshotUrl: screenDetails.screenshotUrl,
      });

      const htmlPath = `StitchSessions/${projectId}/${page.pageName}/page.html`;
      const screenshotPath = commitResult.screenshotPath ?? undefined;

      await this.updatePage(page.pageName, {
        status: 'committed',
        screenshotUrl: screenDetails.screenshotUrl,
        githubHtmlPath: htmlPath,
        githubScreenshotPath: screenshotPath,
        reviewIterations: iteration,
        reviewScore: score,
        stitchPageId: screenId,
      });

      this.emit('stitch_preview', {
        pageName: page.pageName,
        screenshotUrl: screenDetails.screenshotUrl,
        htmlPath,
        score,
        iterations: iteration,
      });
    } catch (err: any) {
      await this.updatePage(page.pageName, { status: 'error', error: err.message });
    }
  }

  // ─── AI Review ─────────────────────────────────────────────────────────────

  private async evaluateStitchMockup(opts: {
    pageName: string;
    html: string;
    screenshotUrl: string;
  }): Promise<{ score: number; improvements: string[] }> {
    try {
      const { generateText } = await import('@/ai/providers');
      const response = await generateText(
        this.env,
        `Score this UI mockup for "${opts.pageName}" on a scale of 0-10.\n` +
        `HTML snippet (first 3000 chars): ${opts.html.slice(0, 3000)}\n\n` +
        `Respond with JSON: { "score": number, "improvements": string[] }\n` +
        `Criteria: accessibility, visual hierarchy, component completeness, dark-theme polish, responsiveness.\n` +
        `A 7+ score means the mockup is approval-ready.`,
        'You are a UX expert reviewing a Stitch-generated HTML mockup. Return only valid JSON.',
        undefined,   // AIOptions
        'gemini',    // providerOverride
      );

      const parsed = JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
      return {
        score: typeof parsed.score === 'number' ? parsed.score : 5,
        improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
      };
    } catch {
      return { score: 7, improvements: [] }; // Default to pass on error
    }
  }

  // ─── Parsers & Helpers ─────────────────────────────────────────────────────

  private parseDesignMd(md: string): UxPageState[] {
    const pages: UxPageState[] = [];

    // Match YAML-style page entries
    const pagePattern = /- name:\s*(\S+)\s*\n\s*title:\s*(.+?)\s*\n(?:\s*prompt:\s*"([\s\S]*?)")?/gm;
    let match: RegExpExecArray | null;

    while ((match = pagePattern.exec(md)) !== null) {
      pages.push({
        id: crypto.randomUUID(),
        pageName: match[1].trim(),
        pageTitle: match[2].trim(),
        stagePrompt: match[3]?.trim(),
        status: 'pending',
        reviewIterations: 0,
      });
    }

    // Fallback: if no pages found, create a single page from the run
    if (pages.length === 0 && md.length > 0) {
      pages.push({
        id: crypto.randomUUID(),
        pageName: 'main',
        pageTitle: 'Main Page',
        status: 'pending',
        reviewIterations: 0,
      });
    }

    return pages;
  }

  private buildJulesPagePrompt(
    page: UxPageState,
    params: { runId: string; repoOwner: string; repoName: string },
  ): string {
    return `# Task: Rebuild "${page.pageTitle}" Page in Astro + Shadcn UI

## Context
The Stitch mockup is committed at:
- HTML: ${page.githubHtmlPath ?? `StitchSessions/*/page.html`}
- Screenshot: ${page.githubScreenshotPath ?? `StitchSessions/*/screenshot.png`}

Read the HTML file from the repository for visual reference, then rebuild it from scratch using:
- Astro page file: \`src/frontend/src/pages/${page.pageName}.astro\`
- React component: \`src/frontend/src/components/pages/${page.pageTitle.replace(/\s+/g, '')}Page.tsx\`

## Shadcn Substitution Rules (CRITICAL)
Every Stitch HTML element must be replaced by the equivalent Shadcn component:
- \`<button>\` → \`<Button>\` from \`@/components/ui/button\`
- \`<input>\` → \`<Input>\` from \`@/components/ui/input\`
- \`<select>\` → \`<Select>\` from \`@/components/ui/select\`
- \`<textarea>\` → \`<Textarea>\` from \`@/components/ui/textarea\`
- \`<table>\` → \`<Table>\` from \`@/components/ui/table\`
- card/panel divs → \`<Card>\` from \`@/components/ui/card\`
- modals/dialogs → \`<Dialog>\` from \`@/components/ui/dialog\`
- tab bars → \`<Tabs>\` from \`@/components/ui/tabs\`
- status/tag elements → \`<Badge>\` from \`@/components/ui/badge\`
- Use \`lucide-react\` for all icons

## Backend Route
Create a Hono route: \`src/backend/src/routes/api/${page.pageName}/index.ts\`
Register it in the main Hono router.

## Tests
Add a smoke test verifying the API route returns HTTP 200.

## PR
Title: \`feat(ux): ${page.pageTitle} page [run-${params.runId.slice(0, 8)}]\``;
  }
}
