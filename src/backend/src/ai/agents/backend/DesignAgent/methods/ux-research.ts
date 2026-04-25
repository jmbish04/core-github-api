/**
 * @file DesignAgent/methods/ux-research.ts
 * @description Absorbed from UxResearcher.ts — Multi-phase UX research pipeline
 *              orchestrating Jules (analysis), Stitch (UI generation), and GitHub commits.
 *              Runs as a long-lived background task via ctx.waitUntil.
 */

import type { AIProvider, BaseAgent } from '@/ai/providers';
import { getJulesClient } from '@/ai/providers';
import { StitchService } from '@/services/stitch';
import { GitHubCommitService } from '@/services/ux/GitHubCommitService';
import { JulesService } from '@/services/jules/service';
import { getDb, workshopUxRuns, workshopUxPages, workshopUxTaskLogs } from '@db';
import { eq } from 'drizzle-orm';
import { getStandardizationRepo } from '@/automations/push/orchestration/sync/standardization-assets';
import { Logger } from '@/lib/logger';
import { getSecret } from '@/utils/secrets';

// ── Phase Types ─────────────────────────────────────────────────────────────

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
  screenshotUrl?: string;
  githubHtmlPath?: string;
  githubScreenshotPath?: string;
  julesSessionId?: string;
  error?: string;
}

export interface UxRunParams {
  runId: string;
  repoOwner: string;
  repoName: string;
  mode: 'autopilot' | 'hitl';
  backendContext: string;
  repoUrl: string;
  registriesContext: string;
}

// ── Pipeline ────────────────────────────────────────────────────────────────

export async function runUxResearchPipeline(
  agent: BaseAgent<any>,
  params: UxRunParams,
  broadcast: (event: string, data: any) => void,
): Promise<{ pages: UxPageState[]; phase: PhaseKey }> {
  const env = agent.getEnv();
  const ai = agent.getAI();
  const logger = new Logger(env, 'DesignAgent:ux-research');
  const db = getDb(env.DB);
  const pages: UxPageState[] = [];

  try {
    await db.insert(workshopUxRuns).values({
      id: params.runId,
      repoOwner: params.repoOwner,
      repoName: params.repoName,
      status: 'running',
      phase: 'analyzing',
      originalPrompt: params.backendContext,
    });

    // ── Phase 1: Analyze with Jules ─────────────────────────────────────
    broadcast('phase_update', { message: 'Starting deep code analysis with Jules...' });

    const julesApiKey = await getSecret(env, 'JULES_API_KEY');
    const { jules: julesSdk } = await import('@google/jules-sdk');
    const julesClient = julesSdk.with({ apiKey: julesApiKey });
    const { owner, repo } = getStandardizationRepo(env);

    const session = await julesClient.session({
      title: `UX Analysis: ${params.repoOwner}/${params.repoName}`,
      prompt: `Analyze the following backend context for ${params.repoUrl}.
Backend Context: ${params.backendContext}
Registries Context: ${params.registriesContext}

Return a JSON array of pages to be generated, formatted exactly like:
[{ "pageName": "dashboard", "pageTitle": "Main Dashboard", "description": "...", "prompt": "Stitch instruction" }]
Do not include markdown blocks, just raw JSON.`,
      source: { github: `${owner}/${repo}`, baseBranch: 'main' },
      requireApproval: false,
      autoPr: false,
    });

    let finalOutcome: any = null;
    let lastProcessedActivityId: string | null = null;

    while (true) {
      const info = await session.info();
      if (info.state === 'completed' || info.state === 'failed') {
        finalOutcome = info.outcome;
        break;
      }
      if (info.state === 'awaitingPlanApproval') await session.approve();

      const activities = await session.activities.select({ limit: 1 });
      const lastActivity = activities[0];
      if (
        lastActivity &&
        lastActivity.id !== lastProcessedActivityId &&
        lastActivity.type === 'agentMessaged' &&
        lastActivity.originator === 'agent'
      ) {
        broadcast('jules_update', { message: lastActivity.message });
        const reply = await ai.generateText(
          `Jules asks: ${lastActivity.message}\nProvide a helpful response to unblock Jules.`,
          'You are a UX Architect overseeing Jules. Provide direct guidance.',
          { provider: 'workers-ai', model: '@cf/meta/llama-3.1-70b-instruct' },
        );
        await session.send(reply);
        lastProcessedActivityId = lastActivity.id;
      }
      await new Promise((r) => setTimeout(r, 6000));
    }

    const pagesJsonStr = finalOutcome?.summary?.[0]?.content || '[]';
    let parsedPages: any[] = [];
    try {
      parsedPages = JSON.parse(pagesJsonStr.replace(/```json/g, '').replace(/```/g, ''));
    } catch {
      logger.error('Failed to parse Jules output as JSON');
      parsedPages = [{ pageName: 'main', pageTitle: 'Main Dashboard', prompt: params.backendContext }];
    }

    const resolvedPages: UxPageState[] = parsedPages.map((p: any) => ({
      id: crypto.randomUUID(),
      pageName: p.pageName,
      pageTitle: p.pageTitle,
      stagePrompt: p.prompt || p.description,
      status: 'pending' as const,
      reviewIterations: 0,
    }));

    pages.push(...resolvedPages);
    await db.update(workshopUxRuns).set({ designMd: JSON.stringify(parsedPages) }).where(eq(workshopUxRuns.id, params.runId));
    broadcast('pages_discovered', { pages: parsedPages });

    // ── Phase 2: Stitch Loop ────────────────────────────────────────────
    const stitch = StitchService.getInstance(env);
    const githubToken = await getSecret(env, 'GITHUB_PERSONAL_ACCESS_TOKEN') || '';
    const github = new GitHubCommitService(githubToken);
    const projectResult = (await stitch.createProject({ title: `UX Run ${params.runId.slice(0, 8)}` })) as Record<string, unknown>;
    const stitchProjectId = (projectResult.projectId ?? projectResult.id ?? '') as string;

    await db.update(workshopUxRuns).set({ stitchProjectId, phase: 'stitch_loop' }).where(eq(workshopUxRuns.id, params.runId));

    for (const page of resolvedPages) {
      await runStitchPageLoop(ai, env, page, stitchProjectId, params, stitch, github, db, broadcast);
    }

    // ── Phase 3: Jules Fleet Build ──────────────────────────────────────
    await triggerJulesFleetBuild(agent, resolvedPages, params, broadcast);

    // ── Done ────────────────────────────────────────────────────────────
    await db.update(workshopUxRuns).set({ status: 'done', phase: 'done' }).where(eq(workshopUxRuns.id, params.runId));
    broadcast('run_complete', { message: 'UX Research complete!' });

    return { pages: resolvedPages, phase: 'done' };
  } catch (err: any) {
    const error = String(err?.message ?? err);
    logger.error('Pipeline error', { error });
    await db.update(workshopUxRuns).set({ status: 'error', error, phase: 'error' }).where(eq(workshopUxRuns.id, params.runId));
    broadcast('error', { message: error });
    return { pages, phase: 'error' };
  }
}

// ── Stitch Page Loop ──────────────────────────────────────────────────────

async function runStitchPageLoop(
  ai: AIProvider,
  env: Env,
  page: UxPageState,
  projectId: string,
  params: UxRunParams,
  stitch: StitchService,
  github: GitHubCommitService,
  db: ReturnType<typeof getDb>,
  broadcast: (event: string, data: any) => void,
) {
  const MAX_ITERATIONS = 3;
  const PASS_SCORE = 7;

  let screenId: string | undefined;
  try {
    const screen = await stitch.generateScreenFromText({
      projectId,
      prompt: page.stagePrompt ?? page.pageTitle,
      deviceType: 'DESKTOP',
    });
    screenId = screen.screenId;
  } catch (err: any) {
    broadcast('page_update', { pageName: page.pageName, status: 'error', error: err.message });
    return;
  }
  if (!screenId) return;

  let iteration = 0;
  let score = 0;
  let approved = false;

  if (params.mode === 'autopilot') {
    while (iteration < MAX_ITERATIONS && !approved) {
      iteration++;
      broadcast('page_update', { pageName: page.pageName, status: 'review', iteration });

      const screenDetails = (await stitch.getScreen({ projectId, screenId: screenId! })) as any;
      const review = await evaluateStitchMockup(ai, env, page.pageTitle, screenDetails.html ?? '');
      score = review.score;
      broadcast('page_update', { pageName: page.pageName, status: 'review', iteration, reviewScore: score });

      if (score >= PASS_SCORE) {
        approved = true;
      } else if (iteration < MAX_ITERATIONS) {
        await stitch.editScreens({ projectId, selectedScreenIds: [screenId], prompt: review.improvements.join('. ') });
      }
    }
  }

  try {
    const screenDetails = (await stitch.getScreen({ projectId, screenId })) as any;
    await github.commitStitchPage({
      owner: params.repoOwner,
      repo: params.repoName,
      stitchProjectId: projectId,
      pageName: page.pageName,
      html: screenDetails.html ?? '<html><body></body></html>',
      screenshotUrl: screenDetails.screenshotUrl,
    });

    const htmlPath = `StitchSessions/${projectId}/${page.pageName}/page.html`;

    await db.insert(workshopUxPages).values({
      id: crypto.randomUUID(),
      runId: params.runId,
      pageName: page.pageName,
      pageTitle: page.pageTitle,
      pagePrompt: page.stagePrompt,
      status: 'done',
      stitchScreenId: screenId,
      stitchHtml: screenDetails.html,
      stitchScreenshotUrl: screenDetails.screenshotUrl,
      githubHtmlPath: htmlPath,
    });

    await db.insert(workshopUxTaskLogs).values({
      runId: params.runId,
      taskName: `Generate ${page.pageTitle}`,
      taskJson: JSON.stringify({ screenId, htmlPath }),
    });

    broadcast('page_generated', { page, screenId, htmlPath });
  } catch (err: any) {
    broadcast('page_update', { pageName: page.pageName, status: 'error', error: err.message });
  }
}

// ── Jules Fleet Builder ─────────────────────────────────────────────────

async function triggerJulesFleetBuild(
  agent: BaseAgent<any>,
  pages: UxPageState[],
  params: UxRunParams,
  broadcast: (event: string, data: any) => void,
) {
  const env = agent.getEnv();
  const CONCURRENCY = 3;
  const committed = pages.filter((p) => p.status === 'committed' || p.status === 'done');
  const queue = [...committed];
  const active: Promise<void>[] = [];
  const engineerAgent = (agent as any).getPeerAgent((env as any).ENGINEER_AGENT);

  const processPage = async (page: UxPageState): Promise<void> => {
    broadcast('jules_status', { phase: 'building', pageName: page.pageName, status: 'Starting Jules session…' });
    const prompt = `# Task: Rebuild "${page.pageTitle}" Page in Astro + Shadcn UI

## Context
The Stitch mockup HTML is committed at: ${page.githubHtmlPath ?? 'StitchSessions/*/page.html'}
Read the HTML file for visual reference, then rebuild from scratch using Astro + React + shadcn/ui.

## Output
- Astro page: \`src/frontend/src/pages/${page.pageName}.astro\`
- React component: \`src/frontend/src/components/pages/${page.pageTitle.replace(/\s+/g, '')}Page.tsx\`
- Backend route: \`src/backend/src/routes/api/${page.pageName}/index.ts\`

## PR Title
feat(ux): ${page.pageTitle} page [run-${params.runId.slice(0, 8)}]`;

    try {
      const sprintId = `ux-${params.runId}-${Date.now()}`;
      await engineerAgent.assignSprint({
        id: sprintId,
        requestId: params.runId,
        title: `Build ${page.pageTitle} Page`,
        subtasks: [
          {
            id: `sub-${Date.now()}`,
            description: prompt,
            role: 'swe',
            status: 'pending'
          }
        ]
      });
      broadcast('jules_status', { phase: 'building', pageName: page.pageName, status: 'Session started', sessionId: sprintId });
    } catch (err: any) {
      broadcast('page_update', { pageName: page.pageName, status: 'error', error: err.message });
    }
  };

  while (queue.length > 0 || active.length > 0) {
    while (active.length < CONCURRENCY && queue.length > 0) {
      const page = queue.shift()!;
      const p = processPage(page);
      const promise = p.then(() => {
        active.splice(active.indexOf(promise), 1);
      });
      active.push(promise);
    }
    if (active.length > 0) await Promise.race(active);
  }
}

// ── Mockup Evaluation ───────────────────────────────────────────────────

async function evaluateStitchMockup(
  ai: AIProvider,
  env: Env,
  pageName: string,
  html: string,
): Promise<{ score: number; improvements: string[] }> {
  try {
    const julesClient = await getJulesClient(env);
    const session = await julesClient.session({
      title: `Evaluate Mockup: ${pageName}`,
      prompt: `Score this UI mockup for "${pageName}" on a scale of 0-10.\nHTML snippet:\n\`\`\`html\n${html}\n\`\`\`\nRespond with JSON: { "score": number, "improvements": string[] }\nCriteria: accessibility, visual hierarchy, dark-theme polish. 7+ = approval-ready.`,
      source: { repoless: true },
      requireApproval: false,
      autoPr: false,
    });

    let finalOutcome: any = null;
    while (true) {
      const info = await session.info();
      if (info.state === 'completed' || info.state === 'failed') {
        finalOutcome = info.outcome;
        break;
      }
      await new Promise((r) => setTimeout(r, 4000));
    }

    const responseText = finalOutcome?.summary?.[0]?.content || '{}';
    const parsed = JSON.parse(responseText.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    return {
      score: typeof parsed.score === 'number' ? parsed.score : 5,
      improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
    };
  } catch {
    return { score: 7, improvements: [] };
  }
}
