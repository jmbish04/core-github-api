import { describe, expect, it } from 'vitest';

import {
  buildResearchDispatchPlan,
  buildResearchOrchestrationPrompt,
  normalizeResearchWorkflowCallback,
  splitResearchTargets,
} from '@/routes/api/frontend/research/workflow-contract';
import researchOneTimeApi, {
  buildResearchCallbackUrl,
} from '@/routes/api/frontend/research/one-time';

describe('research workflow contract', () => {
  it('builds explicit targeted dispatch payloads for repo refs and urls', () => {
    const plan = buildResearchDispatchPlan({
      callbackUrl: 'https://core-github-api.example/api/research/callback',
      githubTerms: ['cloudflare/workers-sdk', 'https://github.com/cloudflare/agents/'],
      projectId: 'proj-123',
    });

    expect(plan.mode).toBe('research-targeted');
    expect(plan.targetedRepos).toEqual([
      'cloudflare/workers-sdk',
      'https://github.com/cloudflare/agents',
    ]);
    expect(plan.payload).toEqual({
      event_type: 'research-targeted',
      client_payload: {
        task_id: 'proj-123',
        project_id: 'proj-123',
        callback_url: 'https://core-github-api.example/api/research/callback',
        repos: ['cloudflare/workers-sdk', 'https://github.com/cloudflare/agents'],
        target_repos: JSON.stringify([
          'cloudflare/workers-sdk',
          'https://github.com/cloudflare/agents',
        ]),
      },
    });
  });

  it('builds keyword dispatch payloads without targeted repo fields', () => {
    const plan = buildResearchDispatchPlan({
      callbackUrl: 'https://core-github-api.example/api/research/callback',
      githubTerms: ['workers ai', 'durable objects'],
      googleTerms: ['cloudflare workers'],
      projectId: 'proj-456',
    });

    expect(plan.mode).toBe('research-keywords');
    expect(plan.targetedRepos).toEqual([]);
    expect(plan.keywordTerms).toEqual([
      'workers ai',
      'durable objects',
      'cloudflare workers',
    ]);
    expect(plan.payload.event_type).toBe('research-keywords');
    expect(plan.payload.client_payload).toEqual({
      task_id: 'proj-456',
      project_id: 'proj-456',
      callback_url: 'https://core-github-api.example/api/research/callback',
      search_keywords: JSON.stringify([
        'workers ai',
        'durable objects',
        'cloudflare workers',
      ]),
      keywords: ['workers ai', 'durable objects', 'cloudflare workers'],
      cloudflare_keywords: 'cloudflare workers',
      github_keywords: 'workers ai, durable objects',
    });
    expect(plan.payload.client_payload).not.toHaveProperty('repos');
    expect(plan.payload.client_payload).not.toHaveProperty('target_repos');
  });

  it('normalizes the new callback body and builds an orchestration prompt from results_file', () => {
    const callback = normalizeResearchWorkflowCallback({
      task_id: 'task-789',
      project_id: 'proj-789',
      status: 'ready',
      path: 'daily-research/task-789',
      event: 'research-keywords',
      mode: 'research-keywords',
      results_file: 'daily-research/task-789/cloudflare-worker-search-results.json',
      cloned_repos: '3',
      discovered_repos: '12',
      new_discovered_repos: '5',
    });

    expect(callback).toEqual({
      taskId: 'task-789',
      projectId: 'proj-789',
      status: 'ready',
      event: 'research-keywords',
      mode: 'research-keywords',
      path: 'daily-research/task-789',
      orchestratorPath: 'daily-research/task-789/cloudflare-worker-search-results.json',
      resultsFile: 'daily-research/task-789/cloudflare-worker-search-results.json',
      clonedRepos: 3,
      discoveredRepos: 12,
      newDiscoveredRepos: 5,
    });

    expect(buildResearchOrchestrationPrompt('jmbish04/core-github-research', callback)).toContain(
      'Use daily-research/task-789/cloudflare-worker-search-results.json as the primary results input.',
    );
  });

  it('preserves legacy dispatcher-start callbacks by inferring targeted mode from results files', () => {
    const callback = normalizeResearchWorkflowCallback(
      {
        task_id: 'legacy-task',
        status: 'ready',
        event: 'research-dispatcher-start',
        results_file: 'daily-research/legacy-task/targeted-repo-research-results.json',
        cloned_repos: '2',
      },
      'proj-legacy',
    );

    expect(callback.projectId).toBe('proj-legacy');
    expect(callback.mode).toBe('research-targeted');
    expect(callback.orchestratorPath).toBe(
      'daily-research/legacy-task/targeted-repo-research-results.json',
    );
    expect(callback.clonedRepos).toBe(2);
  });

  it('ignores non-string keyword and repo targets at runtime', () => {
    const targets = splitResearchTargets([
      'cloudflare/workers-sdk',
      42,
      null,
      'workers ai',
      { repo: 'bad' },
    ] as unknown as string[]);

    expect(targets).toEqual({
      targetedRepos: ['cloudflare/workers-sdk'],
      keywordTerms: ['workers ai'],
    });
  });

  it('handles null callback payloads without crashing', () => {
    const callback = normalizeResearchWorkflowCallback(null, 'proj-null');

    expect(callback).toEqual({
      taskId: 'proj-null',
      projectId: 'proj-null',
      status: 'ready',
      event: 'research-keywords',
      mode: 'research-keywords',
      path: 'daily-research/proj-null',
      orchestratorPath: 'daily-research/proj-null/cloudflare-worker-search-results.json',
      resultsFile: undefined,
      clonedRepos: 0,
      discoveredRepos: 0,
      newDiscoveredRepos: 0,
    });
  });
});

describe('research one-time route robustness', () => {
  it('builds a callback URL from relative request data safely', () => {
    const callbackUrl = buildResearchCallbackUrl({
      env: {} as Env,
      req: {
        url: '/api/research/test-dispatch',
        header: (name: string) => (name.toLowerCase() === 'host' ? 'example.test' : undefined),
      },
    } as never);

    expect(callbackUrl).toBe('http://example.test/api/research/callback');
  });

  it('returns 400 for invalid callback JSON', async () => {
    const response = await researchOneTimeApi.request('/callback', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        host: 'example.test',
      },
      body: '{',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid JSON payload' });
  });
});
