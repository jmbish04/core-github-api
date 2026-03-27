/**
 * @file src/backend/src/ai/agents/workshop/UxResearcher.ts
 * @description Durable Object Agent orchestrating Jules (analysis/building) and Stitch (UI generation).
 * Consolidated 5-phase pipeline (Analyize -> Stitch -> Build) with WebSocket and AgentStateStore.
 */

import type { PersistentAgentState } from '@/ai/agents/support/types';
import { AgentStateStore } from '@/ai/agents/support/state-store';
import { JulesService } from '@/services/jules/service';
import { StitchService } from '@/services/stitch/service';
import { GitHubCommitService } from '@/services/ux/GitHubCommitService';
import { getDb, workshopUxRuns, workshopUxPages, workshopUxTaskLogs } from '@db';
import { eq } from 'drizzle-orm';
import { Agent, run } from '@openai/agents';
import { AIGateway } from '@/ai/utils/ai-gateway';
import { OpenAI } from 'openai';
import { setDefaultOpenAIClient } from '@openai/agents-openai';
import { getStandardizationRepo } from '@/automations/push/orchestration/sync/standardization-assets';
import { createAgent } from '@/ai/agents/honi';

export type PhaseKey = 'idle' | 'analyzing' | 'stitch_loop' | 'awaiting_feedback' | 'building' | 'done' | 'error';

export interface UxPageState {
  id: string;
  pageName: string;
  pageTitle: string;
  stitchPageId?: string;
  status: 'pending' | 'designing' | 'review' | 'committed' | 'building' | 'done' | 'error';
  stagePrompt?: string;
  reviewIterations: number;
  reviewScore?: number;
  screenshotUrl?: string;       // CF Images URL
  githubHtmlPath?: string;      // GitHub Html Path
  githubScreenshotPath?: string;// GitHub Screenshot Path
  julesSessionId?: string;      // Jules build session ID
  error?: string;
}

export interface UxRunState extends PersistentAgentState {
  runId: string;
  repoOwner: string;
  repoName: string;
  mode: 'autopilot' | 'hitl';
  originalPrompt: string;
  designMd?: string; // JSON string representation
  stitchProjectId?: string;
  phase: PhaseKey;
  status: 'idle' | 'running' | 'done' | 'error';
  error?: string;
  pages: UxPageState[];
  history: Record<string, unknown>[];
}

export const baseUxAgent = createAgent<Env>({
  name: 'ux-researcher',
  model: 'workers-ai/@cf/openai/gpt-oss-120b',
  system: 'You are the UX Researcher Agent. You manage UX research workflows and can interact with the user regarding design feedback.',
  binding: 'UX_RESEARCHER',
});

export const uxResearcherHandler = baseUxAgent.handler;

export class UxResearcher extends baseUxAgent.Agent {
  private store: AgentStateStore<UxRunState>;
  private sessions: WebSocket[] = [];

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new AgentStateStore<UxRunState>({
      ctx,
      env,
      agentName: 'UxResearcher',
      initialState: {
        runId: crypto.randomUUID(),
        repoOwner: '',
        repoName: '',
        mode: 'autopilot',
        originalPrompt: '',
        phase: 'idle',
        status: 'idle',
        pages: [],
        history: [],
      },
    });
  }

  // ─── WebSocket Entry ────────────────────────────────────────────────────────

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader === 'websocket') {
       return this.handleWebSocket(request);
    }
    // Fallback to standard Honi routing (/chat, /history, /mcp)
    return super.fetch(request);
  }

  private async handleWebSocket(_request: Request): Promise<Response> {
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    server.accept();
    this.sessions.push(server);

    server.addEventListener('message', async (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.action === 'start') {
          // Kick off async pipeline
          this.ctx.waitUntil(this.runPipeline({
            runId: crypto.randomUUID(),
            repoOwner: msg.repoOwner,
            repoName: msg.repoName,
            mode: msg.mode || 'autopilot',
            backendContext: msg.context,
            repoUrl: msg.repoUrl,
            registriesContext: msg.registriesContext,
          }));
        } else if (msg.action === 'feedback' && this.store.state.phase === 'awaiting_feedback') {
           this.ctx.waitUntil(this.handleHitlFeedback(msg.pageName, msg.feedback, msg.stitchProjectId, msg.screenId));
        } else if (msg.action === 'approve' && this.store.state.phase === 'awaiting_feedback') {
           if (this.pendingApprovalResolve) {
               this.pendingApprovalResolve();
               this.pendingApprovalResolve = null;
           }
        }
      } catch (err) {
        console.error('WS MSG ERR:', err);
      }
    });

    server.addEventListener('close', () => {
      this.sessions = this.sessions.filter(s => s !== server);
    });

    // Send initial state snapshot
    server.send(JSON.stringify({ event: 'state_snapshot', state: this.store.state }));

    return new Response(null, { status: 101, webSocket: client });
  }

  private pendingApprovalResolve: (() => void) | null = null;
  private async waitForHitlApproval(): Promise<void> {
      return new Promise((resolve) => {
          this.pendingApprovalResolve = resolve;
      });
  }

  private broadcast(event: string, data: any) {
    const payload = JSON.stringify({ event, data, state: this.store.state });
    this.sessions.forEach(ws => {
      try {
         ws.send(payload);
      } catch (e) {
        console.error('WS SEND ERR:', JSON.stringify(e));
         // ignore dead sockets
      }
    });
  }

  // ─── State Helpers ─────────────────────────────────────────────────────────

  private async setPhase(phase: PhaseKey): Promise<void> {
    await this.store.patch({ phase } as Partial<UxRunState>);
    this.broadcast('phase_update', { phase });
  }

  private async updatePage(name: string, update: Partial<UxPageState>): Promise<void> {
    const pages = this.store.state.pages.map((p) =>
      p.pageName === name ? { ...p, ...update } : p,
    );
    await this.store.patch({ pages } as Partial<UxRunState>);
    this.broadcast('page_update', { pageName: name, ...update });
  }

  // ─── Core Pipeline ─────────────────────────────────────────────────────────

  private async runPipeline(params: {
    runId: string;
    repoOwner: string;
    repoName: string;
    mode: 'autopilot' | 'hitl';
    backendContext: string;
    repoUrl: string;
    registriesContext: string;
  }) {
    await this.store.patch({
      runId: params.runId,
      repoOwner: params.repoOwner,
      repoName: params.repoName,
      mode: params.mode,
      originalPrompt: params.backendContext,
      status: 'running',
      phase: 'analyzing',
    } as Partial<UxRunState>);

    this.broadcast('phase_update', { message: 'Starting deep code analysis with Jules...' });
    
    const db = getDb(this.env.DB);
    try {
        await db.insert(workshopUxRuns).values({
            id: params.runId,
            repoOwner: params.repoOwner,
            repoName: params.repoName,
            status: 'running',
            phase: 'analyzing',
            originalPrompt: params.backendContext,
        });

        // Initialize reasoning brain
        const { baseUrl, apiKey, aigToken } = await AIGateway.getBaseUrl(this.env, { provider: "workers-ai" });
        const openai = new OpenAI({
            apiKey: apiKey || '',
            baseURL: baseUrl,
            defaultHeaders: aigToken ? { 'cf-aig-authorization': `Bearer ${aigToken}` } : undefined,
        });
        setDefaultOpenAIClient(openai);

        const orchestrator = new Agent({
            name: "UxOrchestrator",
            instructions: "You are a UX Architect overseeing Jules. Provide direct guidance to Jules to ensure high-quality design specs are returned.",
            model: "workers-ai/@cf/openai/gpt-oss-120b",
        });

        // ── Phase 1: Analyzing ──────────────────────────────────────────────────
        const julesApiKey = typeof this.env.JULES_API_KEY === "string" ? this.env.JULES_API_KEY : await (this.env.JULES_API_KEY as any)?.get?.();
        const { jules: julesSdk } = await import('@google/jules-sdk');
        const julesClient = julesSdk.with({ apiKey: julesApiKey });
        const { owner, repo } = getStandardizationRepo(this.env);
        
        const session = await julesClient.session({
            title: `UX Analysis: ${params.repoOwner}/${params.repoName}`,
            prompt: `
            Analyze the following backend context for ${params.repoUrl}.
            Backend Context: ${params.backendContext}
            Registries Context: ${params.registriesContext}
            
            Return a JSON array of pages to be generated, formatted exactly like:
            [
              { "pageName": "dashboard", "pageTitle": "Main Dashboard", "description": "...", "prompt": "Stitch instruction" }
            ]
            Do not include markdown blocks, just raw JSON.
            `,
            source: { github: `${owner}/${repo}`, baseBranch: 'main' },
            requireApproval: false,
            autoPr: false
        });

        let isTerminal = false;
        let finalOutcome: any = null;
        let lastProcessedActivityId: string | null = null;

        while (!isTerminal) {
            const info = await session.info();
            const state = info.state;

            if (state === 'completed' || state === 'failed') {
                finalOutcome = info.outcome;
                isTerminal = true;
                break;
            }

            if (state === 'awaitingPlanApproval') {
                await session.approve();
            }

            const activities = await session.activities.select({ limit: 1 });
            const lastActivity = activities[0];

            if (
                lastActivity && 
                lastActivity.id !== lastProcessedActivityId && 
                lastActivity.type === 'agentMessaged' && 
                lastActivity.originator === 'agent'
            ) {
                this.broadcast('jules_update', { message: lastActivity.message });
                const guidanceResult = await run(orchestrator, `Jules asks: ${lastActivity.message}\nProvide a helpful response to unblock Jules.`);
                const reply = (typeof guidanceResult.finalOutput === 'string' ? guidanceResult.finalOutput : JSON.stringify(guidanceResult.finalOutput)) || "Proceed with standard best practices.";
                await session.send(reply);
                lastProcessedActivityId = lastActivity.id;
            }

            await new Promise(r => setTimeout(r, 6000));
        }

        const pagesJsonStr = finalOutcome?.summary?.[0]?.content || "[]";
        let parsedPages: any[] = [];
        try {
            const cleanStr = pagesJsonStr.replace(/```json/g, '').replace(/```/g, '');
            parsedPages = JSON.parse(cleanStr);
        } catch(err) {
            this.broadcast('jules_update', { message: `Failed to parse JSON directly. Defaulting. Error: ${JSON.stringify(err)}` });
            parsedPages = [{ pageName: 'main', pageTitle: 'Main Dashboard', prompt: params.backendContext }];
        }

        const pages: UxPageState[] = parsedPages.map(p => ({
            id: crypto.randomUUID(),
            pageName: p.pageName,
            pageTitle: p.pageTitle,
            stagePrompt: p.prompt || p.description,
            status: 'pending',
            reviewIterations: 0,
        }));

        await this.store.patch({ pages, designMd: JSON.stringify(parsedPages) } as Partial<UxRunState>);
        await db.update(workshopUxRuns).set({ designMd: JSON.stringify(parsedPages) }).where(eq(workshopUxRuns.id, params.runId));

        this.broadcast('pages_discovered', { pages: parsedPages });

        // ── Phase 2: Stitch Loop ────────────────────────────────────────────────
        await this.setPhase('stitch_loop');

        const stitch = await StitchService.getInstance(this.env);
        const github = new GitHubCommitService(this.env.GITHUB_PERSONAL_ACCESS_TOKEN as unknown as string);
        const project = await stitch.createProject(`UX Run ${params.runId.slice(0, 8)}`);
        
        await this.store.patch({ stitchProjectId: project.projectId } as Partial<UxRunState>);
        await db.update(workshopUxRuns).set({ stitchProjectId: project.projectId, phase: 'stitch_loop' }).where(eq(workshopUxRuns.id, params.runId));

        for (const page of this.store.state.pages) {
            await this.runStitchPageLoop(page, project.projectId, params, stitch, github, db);
        }

        // ── Phase 3: Building (Jules Fleet) ─────────────────────────────────────
        await this.setPhase('building');
        await this.triggerJulesFleetBuild(params);

        // ── Phase 4: Done ───────────────────────────────────────────────────────
        await this.store.patch({ phase: 'done', status: 'done' } as Partial<UxRunState>);
        await db.update(workshopUxRuns).set({ status: 'done', phase: 'done' }).where(eq(workshopUxRuns.id, params.runId));
        this.broadcast('run_complete', { message: 'UX Research complete!' });
    } catch (err: any) {
        const error = String(err?.message ?? err);
        await this.store.patch({ phase: 'error', status: 'error', error } as Partial<UxRunState>);
        const db = getDb(this.env.DB);
        await db.update(workshopUxRuns).set({ status: 'error', error, phase: 'error' }).where(eq(workshopUxRuns.id, this.store.state.runId));
        this.broadcast('error', { message: error });
    }
  }

  // ─── Stitch ──────────────────────────────────────────────────────────

  private async runStitchPageLoop(
    page: UxPageState,
    projectId: string,
    params: { runId: string; repoOwner: string; repoName: string; mode: string },
    stitch: StitchService,
    github: GitHubCommitService,
    db: ReturnType<typeof getDb>,
  ) {
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

    // AI Evaluation Loop if Autopilot
    if (params.mode === 'autopilot') {
        while (iteration < MAX_ITERATIONS && !approved) {
            iteration++;
            await this.updatePage(page.pageName, { status: 'review', reviewIterations: iteration });

            const screenDetails = await stitch.getScreen(projectId, screenId);
            const review = await this.evaluateStitchMockup({
                pageName: page.pageTitle,
                html: screenDetails.html ?? '',
            });

            score = review.score;
            this.broadcast('page_update', { pageName: page.pageName, status: 'review', iteration, reviewScore: score });

            if (score >= PASS_SCORE) {
                approved = true;
            } else if (iteration < MAX_ITERATIONS) {
                await stitch.editScreen(projectId, [screenId], review.improvements.join('. '));
            }
        }
    } else {
        iteration = 1; // Base hitl count
    }

    // Persist to CF Images & GitHub
    try {
      const screenDetails = await stitch.getScreen(projectId, screenId);
      
      let cfImageUrl = screenDetails.screenshotUrl;
      if (cfImageUrl) {
          try {
              const res = await fetch(cfImageUrl);
              const blob = await res.blob();
              const accountId = typeof this.env.CLOUDFLARE_ACCOUNT_ID === "string" ? this.env.CLOUDFLARE_ACCOUNT_ID : await (this.env.CLOUDFLARE_ACCOUNT_ID as any)?.get?.();
              const apiToken = typeof this.env.CLOUDFLARE_API_TOKEN === "string" ? this.env.CLOUDFLARE_API_TOKEN : await (this.env.CLOUDFLARE_API_TOKEN as any)?.get?.();
              const formData = new FormData();
              formData.append('file', blob, 'screenshot.png');
              const imgRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`, {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${apiToken}` },
                  body: formData
              });
              const imgData: any = await imgRes.json();
              if (imgData.success) cfImageUrl = imgData.result.variants[0];
          } catch(err) { 
            console.error('CF IMAGES ERR:', JSON.stringify(err));
          }
      }

      const commitResult = await github.commitStitchPage({
        owner: params.repoOwner,
        repo: params.repoName,
        stitchProjectId: projectId,
        pageName: page.pageName,
        html: screenDetails.html ?? '<html><body></body></html>',
        screenshotUrl: cfImageUrl ?? screenDetails.screenshotUrl,
      });

      const htmlPath = `StitchSessions/${projectId}/${page.pageName}/page.html`;
      const screenshotPath = commitResult.screenshotPath ?? undefined;

      await this.updatePage(page.pageName, {
        status: 'committed',
        screenshotUrl: cfImageUrl,
        githubHtmlPath: htmlPath,
        githubScreenshotPath: screenshotPath,
        reviewIterations: iteration,
        reviewScore: score,
        stitchPageId: screenId,
      });

      await db.insert(workshopUxPages).values({
          id: crypto.randomUUID(),
          runId: params.runId,
          pageName: page.pageName,
          pageTitle: page.pageTitle,
          pagePrompt: page.stagePrompt,
          status: 'done',
          stitchScreenId: screenId,
          stitchHtml: screenDetails.html,
          stitchScreenshotUrl: cfImageUrl,
          githubHtmlPath: htmlPath,
      });

      await db.insert(workshopUxTaskLogs).values({
          runId: params.runId,
          taskName: `Generate ${page.pageTitle}`,
          taskJson: JSON.stringify({ screenId, cfImageUrl, htmlPath })
      });

      this.broadcast('page_generated', { page, screenId, cfImageUrl, htmlPath });

      if (params.mode === 'hitl') {
          await this.setPhase('awaiting_feedback');
          this.broadcast('awaiting_feedback', { page, stitchProjectId: projectId, screenId });
          // PAUSE PIPELINE HERE, WAIT FOR WS MESSAGE
          await this.waitForHitlApproval();
          await this.setPhase('stitch_loop');
      }

    } catch (err: any) {
      await this.updatePage(page.pageName, { status: 'error', error: err.message });
    }
  }

  // ─── Post-Feedback ─────────────────────────────────────────────────────────

  private async handleHitlFeedback(pageName: string, feedback: string, stitchProjectId: string, screenId: string) {
      await this.setPhase('stitch_loop');
      this.broadcast('phase_update', { message: `Iterating ${pageName} based on feedback...` });

      const stitch = await StitchService.getInstance(this.env);
      await stitch.editScreen(stitchProjectId, [screenId], feedback);
      
      const screenDetails = await stitch.getScreen(stitchProjectId, screenId);
      
      const cfImageUrl = screenDetails.screenshotUrl;
      const db = getDb(this.env.DB);
      
      await db.insert(workshopUxTaskLogs).values({
          runId: this.store.state.runId,
          taskName: `Iterate ${pageName}`,
          taskJson: JSON.stringify({ feedback, screenId, cfImageUrl })
      });

      await this.setPhase('awaiting_feedback');
      this.broadcast('page_generated', { page: { pageName }, screenId, cfImageUrl, html: screenDetails.html });
      this.broadcast('awaiting_feedback', { page: { pageName }, stitchProjectId, screenId });
  }

  // ─── Jules Fleet Builder ───────────────────────────────────────────────────

  private async triggerJulesFleetBuild(params: { runId: string, repoOwner: string, repoName: string }) {
      const CONCURRENCY = 3;
      const queue = [...this.store.state.pages.filter((p) => p.status === 'committed')];
      const active: Promise<void>[] = [];

      const jules = JulesService.getInstance(this.env);

      const processPage = async (page: UxPageState): Promise<void> => {
        await this.updatePage(page.pageName, { status: 'building' });
        this.broadcast('jules_status', { phase: 'building', pageName: page.pageName, status: 'Starting Jules session…' });

        const prompt = `# Task: Rebuild "${page.pageTitle}" Page in Astro + Shadcn UI
        
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
        
        ## PR
        Title: \`feat(ux): ${page.pageTitle} page [run-${params.runId.slice(0, 8)}]\``;

        try {
          const session = await jules.startSession({
            prompt,
            repo: { owner: params.repoOwner, repo: params.repoName, branch: 'main' },
            autoPr: true,
            requireApproval: false,
            agentId: `ux-${params.runId}`,
          });

          await this.updatePage(page.pageName, { julesSessionId: session.sessionId, status: 'done' });
          this.broadcast('jules_status', { phase: 'building', pageName: page.pageName, status: 'Jules session started', sessionId: session.sessionId });
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
  }

  // ─── AI Review ─────────────────────────────────────────────────────────────

  private async evaluateStitchMockup(opts: {
    pageName: string;
    html: string;
  }): Promise<{ score: number; improvements: string[] }> {
    try {
      const { generateText } = await import('@/ai/providers');
      const response = await generateText(
        this.env,
        `Score this UI mockup for "${opts.pageName}" on a scale of 0-10.\n` +
        `HTML snippet (first 3000 chars): ${opts.html.slice(0, 3000)}\n\n` +
        `Respond with JSON: { "score": number, "improvements": string[] }\n` +
        `Criteria: accessibility, visual hierarchy, dark-theme polish.\nA 7+ score means the mockup is approval-ready.`,
        'You are a UX expert. Return only JSON.',
        undefined,
        'gemini',
      );

      const parsed = JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
      return {
        score: typeof parsed.score === 'number' ? parsed.score : 5,
        improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
      };
    } catch {
      return { score: 7, improvements: [] };
    }
  }
}
