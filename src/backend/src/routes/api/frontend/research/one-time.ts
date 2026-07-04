import { Hono, type Context } from 'hono';
import { getDb } from '@db';
import { researchProjects, researchReports } from '@/db/schemas/github/research';
import { eq, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getOctokit } from '@/services/octokit/core';
import { createDiscordApiClient } from '@/services/discord/client';
import { Logger } from '@/lib/logger';
import { getGithubToken } from '@/utils/secrets';
import { HoniClient } from '@utils/honi-client';
import {
  buildResearchDispatchPlan,
  buildResearchOrchestrationPrompt,
  type ResearchWorkflowDispatchPlan,
  normalizeResearchWorkflowCallback,
} from './workflow-contract';

const app = new Hono<{ Bindings: Env }>();

type ResearchRouteContext = Context<{ Bindings: Env }>;
type DiagnosticDispatchMode = 'targeted' | 'keyword' | 'both';

function cString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function hasDbBinding(env: unknown): env is { DB: unknown } {
  return typeof env === 'object' && env !== null && 'DB' in env;
}

function resolveResearchQueueRepo(env: Env) {
  const configuredRepo = cString(env.RESEARCH_QUEUE_REPO_NAME) || 'jmbish04/core-github-research';
  const [owner, repo] = configuredRepo.includes('/')
    ? configuredRepo.split('/', 2)
    : [cString(env.GITHUB_OWNER) || 'jmbish04', configuredRepo];
  const fullName = `${owner}/${repo}`;

  return {
    owner,
    repo,
    fullName,
    dispatcherUri:
      cString(env.RESEARCH_QUEUE_REPO_DISPATCHER_URI) ||
      `https://api.github.com/repos/${fullName}/dispatches`,
  };
}

export function buildResearchCallbackUrl(c: ResearchRouteContext): string {
  const baseUrl = cString(c.env.BASE_URL);
  if (baseUrl) {
    return `${baseUrl.replace(/\/+$/, '')}/api/research/callback`;
  }

  try {
    return `${new URL(c.req.url).origin}/api/research/callback`;
  } catch {
    const host = c.req.header('host') || 'localhost';
    const forwardedProto = c.req.header('x-forwarded-proto');
    const protocol =
      forwardedProto === 'https' || forwardedProto === 'http'
        ? forwardedProto
        : typeof c.req.url === 'string' && c.req.url.startsWith('https://')
          ? 'https'
          : 'http';
    return `${protocol}://${host}/api/research/callback`;
  }
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/[\n,]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

async function dispatchResearchWorkflow(
  dispatcherUri: string,
  payload: Record<string, unknown>,
  ghToken: string,
) {
  const res = await fetch(dispatcherUri, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `token ${ghToken}`,
      'User-Agent': 'Core-GitHub-API-Research',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Research dispatch failed: ${res.status} ${await res.text()}`);
  }
}

async function handleResearchWorkflowCallback(c: ResearchRouteContext, routeProjectId?: string) {
  const logger = new Logger(c.env, 'ResearchPipeline');
  let rawPayload: Record<string, unknown> | null | undefined;

  try {
    rawPayload = await c.req.json<Record<string, unknown>>();
  } catch (error) {
    logger.warn('Invalid JSON payload in research callback', {
      routeProjectId,
      error: error instanceof Error ? error.message : String(error),
    });
    if (hasDbBinding(c.env)) {
      await logger.flush();
    }
    return c.json({ error: 'Invalid JSON payload' }, 400);
  }

  try {
    const db = getDb(c.env.DB);
    const callback = normalizeResearchWorkflowCallback(rawPayload, routeProjectId);

    logger.info('Received research workflow callback', {
      callbackEvent: callback.event,
      mode: callback.mode,
      projectId: callback.projectId,
      taskId: callback.taskId,
      path: callback.path,
      resultsFile: callback.resultsFile,
      status: callback.status,
      clonedRepos: callback.clonedRepos,
      discoveredRepos: callback.discoveredRepos,
      newDiscoveredRepos: callback.newDiscoveredRepos,
    });

    const project = await db
      .select()
      .from(researchProjects)
      .where(eq(researchProjects.id, callback.projectId))
      .get();

    if (!project) {
      logger.warn('Ignoring research callback for unknown project', {
        routeProjectId,
        projectId: callback.projectId,
        taskId: callback.taskId,
      });
      await logger.flush();
      return c.json({ success: true, ignored: true, callback });
    }

    const nextStatus =
      callback.status === 'error' || callback.status === 'failed'
        ? 'failed'
        : callback.mode === 'health'
          ? 'active'
          : 'analyzing';

    await db
      .update(researchProjects)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(researchProjects.id, callback.projectId));

    if (callback.mode !== 'health' && nextStatus !== 'failed') {
      const queueRepo = resolveResearchQueueRepo(c.env);
      await HoniClient.chat(
        c.env.AGENT_SESSION_DO,
        `research-orch-${callback.projectId}`,
        buildResearchOrchestrationPrompt(queueRepo.fullName, callback),
      );
    }

    await logger.flush();
    return c.json({ success: true, callback, nextStatus });
  } catch (error: any) {
    logger.error('Research callback failed', {
      projectId: routeProjectId,
      error: error.message,
      stack: error.stack,
    });
    await logger.flush();
    return c.json({ error: error.message }, 500);
  }
}

// 1. Get Projects by Type
app.get('/projects', async (c) => {
  const type = c.req.query('type');
  const db = getDb(c.env.DB);
  let query = db.select().from(researchProjects);
  if (type) query = query.where(eq(researchProjects.type, type)) as any;
  const projects = await query.orderBy(desc(researchProjects.updatedAt));
  return c.json(projects);
});

// 2. Create Draft Project (Returns ID to route to editor)
app.post('/projects/draft', async (c) => {
  const { type } = await c.req.json();
  const db = getDb(c.env.DB);
  const id = uuidv4();

  await db.insert(researchProjects).values({
    id,
    type: type || 'custom',
    status: 'draft',
    title: '',
    githubTerms: [],
    discordTerms: [],
    googleTerms: [],
  });

  return c.json({ id });
});

// 3. Auto-Save / Update Project
app.put('/projects/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const db = getDb(c.env.DB);

  const updateData = { ...body };
  delete updateData.id;
  delete updateData.createdAt;
  delete updateData.updatedAt;

  await db
    .update(researchProjects)
    .set({
      ...updateData,
      updatedAt: new Date(),
    })
    .where(eq(researchProjects.id, id));

  return c.json({ success: true });
});

// 4. Get Distinct Search Terms from historical projects
app.get('/terms/distinct', async (c) => {
  const db = getDb(c.env.DB);
  const projects = await db
    .select({
      github: researchProjects.githubTerms,
      discord: researchProjects.discordTerms,
      google: researchProjects.googleTerms,
    })
    .from(researchProjects);

  const gh = new Set<string>();
  const ds = new Set<string>();
  const go = new Set<string>();

  projects.forEach((p) => {
    if (Array.isArray(p.github)) p.github.forEach((t) => gh.add(t));
    if (Array.isArray(p.discord)) p.discord.forEach((t) => ds.add(t));
    if (Array.isArray(p.google)) p.google.forEach((t) => go.add(t));
  });

  return c.json({ github: Array.from(gh), discord: Array.from(ds), google: Array.from(go) });
});

// 5. Get a specific project and its latest report
app.get('/projects/:id/details', async (c) => {
  const id = c.req.param('id');
  const db = getDb(c.env.DB);
  const project = await db.select().from(researchProjects).where(eq(researchProjects.id, id)).get();
  const reports = await db
    .select()
    .from(researchReports)
    .where(eq(researchReports.projectId, id))
    .orderBy(desc(researchReports.createdAt))
    .limit(1);
  return c.json({ project, latestReport: reports[0] || null });
});

// 6. Get all reports grouped by Project (For Daily Trends Tab)
app.get('/reports', async (c) => {
  const db = getDb(c.env.DB);
  const data = await db
    .select({
      reportId: researchReports.id,
      createdAt: researchReports.createdAt,
      projectTitle: researchProjects.title,
      projectId: researchProjects.id,
      findings: researchReports.findings,
    })
    .from(researchReports)
    .leftJoin(researchProjects, eq(researchReports.projectId, researchProjects.id))
    .orderBy(desc(researchReports.createdAt));

  return c.json(data);
});

// 7. Translate natural language to Cron expression
app.post('/cron/translate', async (c) => {
  const { prompt } = await c.req.json();
  const ai = c.env.AI as any;

  const systemPrompt = `
    You are a strict Cloudflare Worker cron schedule expression generator. 
    The user will provide a desired schedule in natural language. 
    Return a JSON object with a single key 'cron' containing the standard 5-part cron expression (minute hour day month day-of-week). 
    No other text. For example, "Run every day at 8am" should be converted to "0 8 * * *".
  `;

  try {
    const response = await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          type: 'object',
          properties: {
            cron: { type: 'string' },
          },
          required: ['cron'],
        },
      },
    });

    let result = response as any;
    if (result.response && typeof result.response === 'string') {
      result = JSON.parse(result.response);
    } else if (typeof result === 'string') {
      result = JSON.parse(result);
    }

    return c.json({ cron: result.cron });
  } catch (e) {
    console.error('Failed to parse cron:', e);
    return c.json({ error: 'Failed' }, 500);
  }
});

app.post('/keywords/improve', async (c) => {
  const { query } = await c.req.json();
  const ai = c.env.AI as any;
  const prompt = `Convert this vague query into targeted search keywords.
Query: "${query}"
Output a JSON object with "githubTerms" (array of 3 strings for GitHub repo search, e.g. "auth redis bypass") and "discordTerms" (array of 3 specific strings for Discord message search, e.g. "how to bypass limits").`;
  try {
    const response = await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [{ role: 'user', content: prompt }],
      response_format: {
        type: 'json_schema',
        json_schema: {
          type: 'object',
          properties: {
            githubTerms: { type: 'array', items: { type: 'string' } },
            discordTerms: { type: 'array', items: { type: 'string' } },
          },
          required: ['githubTerms', 'discordTerms'],
        },
      },
    });
    let result = response as any;
    if (result.response && typeof result.response === 'string') result = JSON.parse(result.response);
    else if (typeof result === 'string') result = JSON.parse(result);
    return c.json({ githubTerms: result.githubTerms || [], discordTerms: result.discordTerms || [] });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/keywords/extract', async (c) => {
  const { directive } = await c.req.json();
  const ai = c.env.AI as any;
  const prompt = `Extract a short, 3-5 word general search query from the following intelligence directive.
Directive: "${directive}"
Output a JSON object with a single string field "query" that represents the core topic.`;
  try {
    const response = await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [{ role: 'user', content: prompt }],
      response_format: {
        type: 'json_schema',
        json_schema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      },
    });
    let result = response as any;
    if (result.response && typeof result.response === 'string') result = JSON.parse(result.response);
    else if (typeof result === 'string') result = JSON.parse(result);
    return c.json({ query: result.query || '' });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// 8. Test Search Configuration (Wizard Step 2)
app.post('/test', async (c) => {
  const { githubTerms, discordTerms } = await c.req.json();
  const ai = c.env.AI as any;

  const results: any = {
    github: [],
    discord: [],
    aiInterpretation: '',
  };

  try {
    if (githubTerms && githubTerms.length > 0) {
      const octokit = await getOctokit(c.env as any);
      const term = githubTerms[0];

      const searchRes = await octokit.rest.search.repos({
        q: term,
        sort: 'stars',
        per_page: 3,
      });

      results.github = searchRes.data.items.map((item: any) => ({
        name: item.full_name,
        url: item.html_url,
        description: item.description,
        stars: item.stargazers_count,
        topics: item.topics,
      }));
    }

    if (discordTerms && discordTerms.length > 0) {
      try {
        const discord = await createDiscordApiClient(c.env as Env);
        const guilds = await discord.getGuilds();
        const searchRegex = new RegExp(discordTerms[0], 'i');

        if (guilds.length > 0) {
          const channels = await discord.getGuildChannels(guilds[0].id);
          const textChannels = channels.filter((ch) => ch.type === 0);

          if (textChannels.length > 0) {
            const messages = await discord.getChannelMessages(textChannels[0].id, 100);
            const matched = messages.filter((m) => searchRegex.test(m.content)).slice(0, 3);

            results.discord = matched.map((m: any) => ({
              channel: textChannels[0].name || textChannels[0].id,
              content: m.content,
              author: m.author?.username || 'unknown',
            }));
          }
        }
      } catch (err) {
        console.warn('Discord test fetch failed:', err);
        results.discord = [
          { channel: 'error', content: 'Failed to connect to Discord API.', author: 'system' },
        ];
      }
    }

    if (results.github.length > 0 || results.discord.length > 0) {
      const summaryContext = `
        GitHub Findings: ${JSON.stringify(results.github, null, 2)}
        Discord Findings: ${JSON.stringify(results.discord, null, 2)}
      `;

      const prompt = `You are an AI assistant helping a user configure a research agent.
They entered some search terms and I ran a test search. Look at the findings below.
Write a very brief (2-3 sentences max) "AI Interpretation" telling the user what kind of content these terms are pulling in, and if they seem like high-quality signals for an automated research agent.

Findings:
${summaryContext}`;

      const aiResponse = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [{ role: 'user', content: prompt }],
      });

      const interpretation = (aiResponse as any).response || 'Could not generate interpretation.';
      results.aiInterpretation = interpretation.trim();
    } else {
      results.aiInterpretation =
        'No results found for these terms. You may want to broaden your search.';
    }

    return c.json(results);
  } catch (error: any) {
    console.error('Test search failed:', error);
    return c.json({ error: 'Search test failed', details: error.message }, 500);
  }
});

// 9. Trigger Research Pipeline
app.post('/projects/:id/trigger', async (c) => {
  const id = c.req.param('id');
  const db = getDb(c.env.DB);
  const logger = new Logger(c.env, 'ResearchPipeline');

  try {
    const project = await db.select().from(researchProjects).where(eq(researchProjects.id, id)).get();
    if (!project) {
      logger.error('Project not found for trigger', { projectId: id });
      await logger.flush();
      return c.json({ error: 'Not found' }, 404);
    }

    logger.info('Research pipeline triggered', { projectId: id, type: project.type });
    let discordContext = '';

    if (project.discordTerms && project.discordTerms.length > 0) {
      try {
        const discord = await createDiscordApiClient(c.env as Env);
        const guilds = await discord.getGuilds();

        let allMatched: any[] = [];

        for (const term of project.discordTerms) {
          const searchRegex = new RegExp(term, 'i');
          if (guilds.length > 0) {
            const channels = await discord.getGuildChannels(guilds[0].id);
            const textChannels = channels.filter((ch: any) => ch.type === 0);

            if (textChannels.length > 0) {
              const messages = await discord.getChannelMessages(textChannels[0].id, 100);
              const matched = messages.filter((m: any) => searchRegex.test(m.content));
              allMatched = [...allMatched, ...matched];
            }
          }
        }

        if (allMatched.length > 0) {
          discordContext = allMatched
            .map((m) => `**Author:** ${m.author?.username || 'unknown'}\n**Message:** ${m.content}\n---`)
            .join('\n');
          logger.info('Extracted Discord context for staging', { matchedCount: allMatched.length });
        }
      } catch (err: any) {
        logger.error('Discord fetch failed during trigger', { error: err.message });
      }
    }

    const queueRepo = resolveResearchQueueRepo(c.env);
    if (discordContext) {
      const octokit = await getOctokit(c.env as Env);
      logger.info('Pushing Discord context to staging repo', { repo: queueRepo.fullName });
      const path = `daily-research/${project.id}/discord/raw-export.md`;

      let sha;
      try {
        const { data } = await octokit.rest.repos.getContent({
          owner: queueRepo.owner,
          repo: queueRepo.repo,
          path,
        });
        if (!Array.isArray(data)) sha = (data as any).sha;
      } catch {
        // sha lookup may fail for new files
      }

      await octokit.rest.repos.createOrUpdateFileContents({
        owner: queueRepo.owner,
        repo: queueRepo.repo,
        path,
        message: `🚀 Stage Discord Research data for ${project.id}`,
        content: btoa(unescape(encodeURIComponent(discordContext))),
        sha,
      });
    }

    const dispatchPlan = buildResearchDispatchPlan({
      callbackUrl: buildResearchCallbackUrl(c),
      githubTerms: project.githubTerms,
      goal: project.goal,
      googleTerms: project.googleTerms,
      projectId: id,
      taskId: id,
    });

    logger.info('Dispatching research workflow', {
      callbackUrl: cString(dispatchPlan.payload.client_payload.callback_url),
      keywordTerms: dispatchPlan.keywordTerms,
      mode: dispatchPlan.mode,
      repo: queueRepo.fullName,
      targetedRepos: dispatchPlan.targetedRepos,
    });

    const ghToken = await getGithubToken(c.env);
    if (!ghToken) {
      throw new Error('Missing GitHub token for research dispatch');
    }

    await dispatchResearchWorkflow(queueRepo.dispatcherUri, dispatchPlan.payload, ghToken);

    await db
      .update(researchProjects)
      .set({ status: 'in_progress', updatedAt: new Date() })
      .where(eq(researchProjects.id, id));

    await logger.flush();
    return c.json({
      success: true,
      message: 'Pipeline dispatched',
      mode: dispatchPlan.mode,
      callbackUrl: dispatchPlan.payload.client_payload.callback_url,
      keywordTerms: dispatchPlan.keywordTerms,
      targetedRepos: dispatchPlan.targetedRepos,
    });
  } catch (error: any) {
    logger.error('Research pipeline failed', { projectId: id, error: error.message, stack: error.stack });
    await logger.flush();
    return c.json({ error: error.message }, 500);
  }
});

// 10. Callback from GitHub Action. `/callback` matches the current workflow contract,
// while `/projects/:id/callback` remains as the legacy per-project alias.
app.post('/callback', async (c) => handleResearchWorkflowCallback(c));
app.post('/projects/:id/callback', async (c) => {
  return handleResearchWorkflowCallback(c, c.req.param('id'));
});

// 11. Workflow Diagnostics - Dispatcher Test
app.post('/test-dispatch', async (c) => {
  const logger = new Logger(c.env, 'ResearchPipeline');
  try {
    const requestBody = c.req.header('content-type')?.includes('application/json')
      ? ((await c.req.json().catch(() => ({}))) as Record<string, unknown>)
      : {};
    const requestedMode: DiagnosticDispatchMode =
      requestBody.mode === 'keyword' || requestBody.mode === 'both' ? requestBody.mode : 'targeted';
    const explicitRepos = normalizeStringList(requestBody.repos);
    const keywordTerms = normalizeStringList(requestBody.searchKeywords ?? requestBody.keywords);
    const queueRepo = resolveResearchQueueRepo(c.env);
    const callbackUrl = buildResearchCallbackUrl(c);
    const ghToken = await getGithubToken(c.env);

    if (!ghToken) {
      throw new Error('Missing GitHub token for diagnostic research dispatch');
    }

    const baseId = cString(requestBody.projectId) || cString(requestBody.taskId) || `test-${Date.now()}`;
    const dispatchPlans: ResearchWorkflowDispatchPlan[] = [];

    if (requestedMode === 'targeted' || requestedMode === 'both') {
      dispatchPlans.push(
        buildResearchDispatchPlan({
          callbackUrl,
          githubTerms:
            explicitRepos.length > 0 ? explicitRepos : ['cloudflare/workers-sdk', 'cloudflare/agents'],
          projectId: requestedMode === 'both' ? `${baseId}-targeted` : baseId,
          taskId: requestedMode === 'both' ? `${baseId}-targeted` : baseId,
        }),
      );
    }

    if (requestedMode === 'keyword' || requestedMode === 'both') {
      dispatchPlans.push(
        buildResearchDispatchPlan({
          callbackUrl,
          goal: 'diagnostic research dispatch',
          googleTerms:
            keywordTerms.length > 0 ? keywordTerms : ['cloudflare workers', 'durable objects'],
          projectId: requestedMode === 'both' ? `${baseId}-keywords` : baseId,
          taskId: requestedMode === 'both' ? `${baseId}-keywords` : baseId,
        }),
      );
    }

    logger.info('Triggering diagnostic research dispatch', {
      callbackUrl,
      dispatcherUri: queueRepo.dispatcherUri,
      mode: requestedMode,
      repo: queueRepo.fullName,
    });

    const dispatches: Array<{ link: string; mode: string; taskId: string }> = [];
    for (const plan of dispatchPlans) {
      await dispatchResearchWorkflow(queueRepo.dispatcherUri, plan.payload, ghToken);
      const taskId = String(plan.payload.client_payload.task_id);
      dispatches.push({
        link: `https://github.com/${queueRepo.fullName}/tree/main/daily-research/${taskId}`,
        mode: plan.mode,
        taskId,
      });
    }

    const diagnosticLink =
      requestedMode === 'both'
        ? `https://github.com/${queueRepo.fullName}/tree/main/daily-research`
        : dispatches[0]?.link;

    logger.info('Diagnostic dispatch initiated successfully', {
      dispatchCount: dispatches.length,
      link: diagnosticLink,
      mode: requestedMode,
    });
    await logger.flush();

    return c.json({
      success: true,
      message: 'Diagnostic dispatch sent',
      mode: requestedMode,
      dispatches,
      testId: dispatches[0]?.taskId,
      link: diagnosticLink,
    });
  } catch (error: any) {
    logger.error('Diagnostic dispatch failed', { error: error.message, stack: error.stack });
    await logger.flush();
    return c.json({ error: error.message }, 500);
  }
});

export default app;
