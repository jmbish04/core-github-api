import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import {
  ReverseEngineeringAnalyzeInputSchema,
  ReverseEngineeringAnalyzeResponseSchema,
  ReverseEngineeringConsultInputSchema,
  ReverseEngineeringConsultResponseSchema,
  ReverseEngineeringErrorResponseSchema,
  ReverseEngineeringEventsResponseSchema,
  ReverseEngineeringListQuerySchema,
  ReverseEngineeringListResponseSchema,
  ReverseEngineeringResumeInputSchema,
  ReverseEngineeringResumeResponseSchema,
  ReverseEngineeringSnapshotParamsSchema,
  ReverseEngineeringSnapshotResponseSchema,
} from '@/lib/schemas/reverse-engineering';
import {
  createReverseEngineeringSnapshot,
  getReverseEngineeringSnapshot,
  listReverseEngineeringEvents,
  listReverseEngineeringSnapshots,
} from '@/services/reverse-engineering/store';
import { getOrCreateProjectForRepository } from '@/services/reverse-engineering/projects';
import { HoniClient } from '@utils/honi-client';
import { BroadcastClient } from '@utils/do-broadcast';

const app = new OpenAPIHono<{ Bindings: Env }>();

function renderMarkdownHtml(title: string, markdown: string): string {
  const escaped = markdown
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: ui-sans-serif, system-ui, sans-serif;
      }
      body {
        margin: 0;
        background: #070b16;
        color: #e5e7eb;
      }
      main {
        max-width: 1040px;
        margin: 0 auto;
        padding: 32px 20px 80px;
      }
      pre {
        white-space: pre-wrap;
        word-break: break-word;
        background: #111827;
        border: 1px solid #1f2937;
        border-radius: 12px;
        padding: 20px;
        overflow: auto;
      }
      a { color: #60a5fa; }
    </style>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p><a href="./plan.md">Raw markdown</a> · <a href="./download">Download</a></p>
      <pre>${escaped}</pre>
    </main>
  </body>
</html>`;
}

function parseRepoUrl(repoUrl: string): { owner: string; repo: string } | null {
  try {
    const parsed = new URL(repoUrl);
    const match = parsed.pathname.replace(/^\/+/, '').replace(/\.git$/, '').match(/^([^/]+)\/([^/]+)$/);
    if (!match) {
      return null;
    }
    return {
      owner: match[1]!,
      repo: match[2]!,
    };
  } catch {
    return null;
  }
}

function resolveRepositoryCoordinates(input: {
  owner?: string;
  repo?: string;
  githubRepo?: string;
  repoUrl?: string;
}): { owner: string; repo: string; repoUrl: string } {
  if (input.owner && input.repo) {
    return {
      owner: input.owner,
      repo: input.repo,
      repoUrl: input.repoUrl || `https://github.com/${input.owner}/${input.repo}`,
    };
  }

  if (input.githubRepo) {
    const [owner, repo] = input.githubRepo.split('/');
    if (owner && repo) {
      return {
        owner,
        repo,
        repoUrl: input.repoUrl || `https://github.com/${owner}/${repo}`,
      };
    }
  }

  if (input.repoUrl) {
    const parsed = parseRepoUrl(input.repoUrl);
    if (parsed) {
      return {
        owner: parsed.owner,
        repo: parsed.repo,
        repoUrl: input.repoUrl,
      };
    }
  }

  throw new Error('Unable to resolve GitHub owner/repo from the analyze request.');
}

async function loadSnapshotOr404(c: Context<{ Bindings: Env }>) {
  const snapshotId = c.req.param('id') as string;
  const snapshot = await getReverseEngineeringSnapshot(c.env, snapshotId);
  if (!snapshot) {
    return {
      snapshotId,
      snapshot: null,
      response: c.json({ success: false, error: 'Reverse engineering snapshot not found' }, 404),
    };
  }

  return { snapshotId, snapshot, response: null };
}

const analyzeRoute = createRoute({
  method: 'post',
  path: '/analyze',
  operationId: 'analyzeRepositoryReverseEngineering',
  summary: 'Queue a reverse-engineering snapshot',
  tags: ['Reverse Engineering'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: ReverseEngineeringAnalyzeInputSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Reverse-engineering snapshot created and orchestration queued.',
      content: {
        'application/json': {
          schema: ReverseEngineeringAnalyzeResponseSchema,
        },
      },
    },
    400: {
      description: 'Invalid request.',
      content: {
        'application/json': {
          schema: ReverseEngineeringErrorResponseSchema,
        },
      },
    },
  },
});

app.openapi(analyzeRoute, async (c) => {
  const payload = c.req.valid('json');
  const repo = resolveRepositoryCoordinates(payload);
  const snapshotId = crypto.randomUUID();
  const projectLookup = await getOrCreateProjectForRepository(c.env, {
    owner: repo.owner,
    repo: repo.repo,
    repoUrl: repo.repoUrl,
    projectId: payload.projectId,
    description: payload.title || null,
  });

  const snapshot = await createReverseEngineeringSnapshot(c.env, {
    ...payload,
    snapshotId,
    projectId: projectLookup.projectId || undefined,
    githubOwner: repo.owner,
    githubRepo: repo.repo,
    repoUrl: repo.repoUrl,
  });
  await HoniClient.fetch(c.env.HONI_ORCHESTRATOR, snapshotId, '/run', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return c.json({
    success: true,
    snapshotId,
    snapshot,
    projectId: projectLookup.projectId,
    repoId: projectLookup.repoId,
    detailUrl: `/api/reverse-engineering/snapshots/${snapshotId}`,
    websocketUrl: `/api/reverse-engineering/snapshots/${snapshotId}/ws`,
    consultantUrl: `/api/reverse-engineering/snapshots/${snapshotId}/consult`,
  }) as any;
});

const listSnapshotsRoute = createRoute({
  method: 'get',
  path: '/snapshots',
  operationId: 'listReverseEngineeringSnapshots',
  summary: 'List reverse-engineering snapshots',
  tags: ['Reverse Engineering'],
  request: {
    query: ReverseEngineeringListQuerySchema,
  },
  responses: {
    200: {
      description: 'Snapshots returned.',
      content: {
        'application/json': {
          schema: ReverseEngineeringListResponseSchema,
        },
      },
    },
  },
});

app.openapi(listSnapshotsRoute, async (c) => {
  const query = c.req.valid('query');
  const snapshots = await listReverseEngineeringSnapshots(c.env, query);
  return c.json({ success: true, snapshots }) as any;
});

const getSnapshotRoute = createRoute({
  method: 'get',
  path: '/snapshots/{id}',
  operationId: 'getReverseEngineeringSnapshot',
  summary: 'Get a reverse-engineering snapshot',
  tags: ['Reverse Engineering'],
  request: {
    params: ReverseEngineeringSnapshotParamsSchema,
  },
  responses: {
    200: {
      description: 'Snapshot returned.',
      content: {
        'application/json': {
          schema: ReverseEngineeringSnapshotResponseSchema,
        },
      },
    },
    404: {
      description: 'Snapshot not found.',
      content: {
        'application/json': {
          schema: ReverseEngineeringErrorResponseSchema,
        },
      },
    },
  },
});

app.openapi(getSnapshotRoute, async (c) => {
  const loaded = await loadSnapshotOr404(c);
  if (loaded.response) {
    return loaded.response as any;
  }

  return c.json({ success: true, snapshot: loaded.snapshot }) as any;
});

const getEventsRoute = createRoute({
  method: 'get',
  path: '/snapshots/{id}/events',
  operationId: 'listReverseEngineeringSnapshotEvents',
  summary: 'List reverse-engineering snapshot events',
  tags: ['Reverse Engineering'],
  request: {
    params: ReverseEngineeringSnapshotParamsSchema,
  },
  responses: {
    200: {
      description: 'Snapshot events returned.',
      content: {
        'application/json': {
          schema: ReverseEngineeringEventsResponseSchema,
        },
      },
    },
    404: {
      description: 'Snapshot not found.',
      content: {
        'application/json': {
          schema: ReverseEngineeringErrorResponseSchema,
        },
      },
    },
  },
});

app.openapi(getEventsRoute, async (c) => {
  const loaded = await loadSnapshotOr404(c);
  if (loaded.response) {
    return loaded.response as any;
  }

  const events = await listReverseEngineeringEvents(c.env, loaded.snapshotId);
  return c.json({ success: true, events }) as any;
});

app.get('/snapshots/:id/ws', async (c) => {
  const snapshotId = c.req.param('id') as string;
  return BroadcastClient.upgradeWebSocket(c.env.REVERSE_ENGINEERING_MONITOR, snapshotId, c.req.raw, `/ws?snapshotId=${encodeURIComponent(snapshotId)}`);
});

const resumeRoute = createRoute({
  method: 'post',
  path: '/snapshots/{id}/resume',
  operationId: 'resumeReverseEngineeringSnapshot',
  summary: 'Resume a paused reverse-engineering snapshot with auth details',
  tags: ['Reverse Engineering'],
  request: {
    params: ReverseEngineeringSnapshotParamsSchema,
    body: {
      content: {
        'application/json': {
          schema: ReverseEngineeringResumeInputSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Snapshot resumed.',
      content: {
        'application/json': {
          schema: ReverseEngineeringResumeResponseSchema,
        },
      },
    },
    404: {
      description: 'Snapshot not found.',
      content: {
        'application/json': {
          schema: ReverseEngineeringErrorResponseSchema,
        },
      },
    },
  },
});

app.openapi(resumeRoute, async (c) => {
  const loaded = await loadSnapshotOr404(c);
  if (loaded.response) {
    return loaded.response as any;
  }

  const payload = c.req.valid('json');
  await HoniClient.fetch(c.env.HONI_ORCHESTRATOR, loaded.snapshotId, '/resume', {
    method: 'POST',
    body: JSON.stringify({
      snapshotId: loaded.snapshotId,
      auth: payload.auth,
      frontendUrl: payload.frontendUrl,
    }),
  });

  return c.json({ success: true, snapshotId: loaded.snapshotId, resumed: true as const }) as any;
});

const consultRoute = createRoute({
  method: 'post',
  path: '/snapshots/{id}/consult',
  operationId: 'consultReverseEngineeringSnapshot',
  summary: 'Query the reverse-engineering consultant for a snapshot',
  tags: ['Reverse Engineering'],
  request: {
    params: ReverseEngineeringSnapshotParamsSchema,
    body: {
      content: {
        'application/json': {
          schema: ReverseEngineeringConsultInputSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Consultant response returned.',
      content: {
        'application/json': {
          schema: ReverseEngineeringConsultResponseSchema,
        },
      },
    },
    404: {
      description: 'Snapshot not found.',
      content: {
        'application/json': {
          schema: ReverseEngineeringErrorResponseSchema,
        },
      },
    },
  },
});

app.openapi(consultRoute, async (c) => {
  const loaded = await loadSnapshotOr404(c);
  if (loaded.response) {
    return loaded.response as any;
  }

  const payload = c.req.valid('json');
  const response = await HoniClient.fetch(c.env.HONI_CONSULTANT, loaded.snapshotId, '/chat', {
    method: 'POST',
    body: JSON.stringify({
      snapshotId: loaded.snapshotId,
      role: payload.role,
      message: payload.message,
      history: payload.history,
      sessionId: payload.sessionId,
      model: payload.model,
    }),
  });

  const result = await response.json();
  return c.json(result, response.status as 200) as any;
});

const viewPlanRoute = createRoute({
  method: 'get',
  path: '/snapshots/{id}/plan',
  operationId: 'renderReverseEngineeringPlan',
  summary: 'Render the PRD markdown as HTML',
  tags: ['Reverse Engineering'],
  request: {
    params: ReverseEngineeringSnapshotParamsSchema,
  },
  responses: {
    200: {
      description: 'Rendered PRD HTML.',
      content: {
        'text/html': {
          schema: z.string(),
        },
      },
    },
    404: {
      description: 'Snapshot not found.',
      content: {
        'application/json': {
          schema: ReverseEngineeringErrorResponseSchema,
        },
      },
    },
    409: {
      description: 'PRD markdown is not ready yet.',
      content: {
        'application/json': {
          schema: ReverseEngineeringErrorResponseSchema,
        },
      },
    },
  },
});

app.openapi(viewPlanRoute, async (c) => {
  const loaded = await loadSnapshotOr404(c);
  if (loaded.response) {
    return loaded.response as any;
  }

  const markdown = loaded.snapshot?.prdMarkdown;
  if (!markdown) {
    return c.json({ success: false, error: 'PRD markdown is not ready yet' }, 409) as any;
  }

  return c.html(renderMarkdownHtml(`Reverse Engineering ${loaded.snapshotId}`, markdown)) as any;
});

const getPlanMarkdownRoute = createRoute({
  method: 'get',
  path: '/snapshots/{id}/plan.md',
  operationId: 'getReverseEngineeringPlanMarkdown',
  summary: 'Return raw PRD markdown',
  tags: ['Reverse Engineering'],
  request: {
    params: ReverseEngineeringSnapshotParamsSchema,
  },
  responses: {
    200: {
      description: 'Raw PRD markdown.',
      content: {
        'text/markdown': {
          schema: z.string(),
        },
      },
    },
    404: {
      description: 'Snapshot not found.',
      content: {
        'application/json': {
          schema: ReverseEngineeringErrorResponseSchema,
        },
      },
    },
    409: {
      description: 'PRD markdown is not ready yet.',
      content: {
        'application/json': {
          schema: ReverseEngineeringErrorResponseSchema,
        },
      },
    },
  },
});

app.openapi(getPlanMarkdownRoute, async (c) => {
  const loaded = await loadSnapshotOr404(c);
  if (loaded.response) {
    return loaded.response as any;
  }

  const markdown = loaded.snapshot?.prdMarkdown;
  if (!markdown) {
    return c.json({ success: false, error: 'PRD markdown is not ready yet' }, 409) as any;
  }

  return new Response(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  }) as any;
});

const downloadPlanRoute = createRoute({
  method: 'get',
  path: '/snapshots/{id}/download',
  operationId: 'downloadReverseEngineeringPlanMarkdown',
  summary: 'Download the PRD markdown',
  tags: ['Reverse Engineering'],
  request: {
    params: ReverseEngineeringSnapshotParamsSchema,
  },
  responses: {
    200: {
      description: 'Downloadable PRD markdown.',
      content: {
        'text/markdown': {
          schema: z.string(),
        },
      },
    },
    404: {
      description: 'Snapshot not found.',
      content: {
        'application/json': {
          schema: ReverseEngineeringErrorResponseSchema,
        },
      },
    },
    409: {
      description: 'PRD markdown is not ready yet.',
      content: {
        'application/json': {
          schema: ReverseEngineeringErrorResponseSchema,
        },
      },
    },
  },
});

app.openapi(downloadPlanRoute, async (c) => {
  const loaded = await loadSnapshotOr404(c);
  if (loaded.response) {
    return loaded.response as any;
  }

  const markdown = loaded.snapshot?.prdMarkdown;
  if (!markdown) {
    return c.json({ success: false, error: 'PRD markdown is not ready yet' }, 409) as any;
  }

  return new Response(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="reverse-engineering-${loaded.snapshotId}.md"`,
    },
  }) as any;
});

export default app;
