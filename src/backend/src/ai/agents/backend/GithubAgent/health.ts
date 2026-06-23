/**
 * @file GithubAgent/health.ts
 * @description Comprehensive Layer 3 health check for GithubAgent webhook processing.
 *
 * Simulates real GitHub events using Octokit/Fetch against HEALTH_TEST_REPO_NAME,
 * then polls the agent to ensure webhooks were correctly received & stored.
 */

import type { HealthCheck, HealthMode } from '@/ai/providers/agent-support/health';
import type { GithubAgent } from './index';
import { getSecret } from '@/utils/secrets';
import { Logger } from '@/lib/logger';
import { getRef, createBranch, createOrUpdateFile } from '@/ai/mcp/tools/github/github';

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 45_000;

function makeHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'Cloudflare-Worker-GithubAgentHealthCheck',
    'Content-Type': 'application/json',
  };
}

async function ghFetch(token: string, url: string, options?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: { ...makeHeaders(token), ...(options?.headers ? options.headers : {}) },
  });
}

/**
 * Polls the GithubAgent's event store until it finds an event recently created
 * that matches the specified type and action.
 */
async function pollForEvent(
  agent: GithubAgent,
  startTime: number,
  expectedType: string,
  expectedAction?: string
): Promise<{ found: boolean; event?: any }> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const events = agent.getEvents(50);
    const match = events.find(e => {
      const eventTime = new Date(e.timestamp).getTime();
      if (eventTime < startTime - 5000) return false; // Allow slight clock skew, but mainly events after we started
      if (e.type !== expectedType) return false;
      if (expectedAction && e.action !== expectedAction) return false;
      return true;
    });

    if (match) {
      return { found: true, event: match };
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  return { found: false };
}

export async function runGithubAgentHealthChecks(
  env: Env,
  agent: GithubAgent,
  mode: HealthMode
): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = [];
  const overallStart = Date.now();
  const logger = new Logger(env as any, 'health/github-agent');

  // 1. Base Token Check (Ping / Access Check)
  const token = await getSecret(env, 'GITHUB_TOKEN');
  if (!token) {
    checks.push({
      name: 'agent.github.apiToken',
      layer: 3,
      category: 'tool',
      status: 'skip',
      durationMs: Date.now() - overallStart,
      message: 'GITHUB_TOKEN not configured',
    });
    return checks;
  }

  let pingPass = false;
  try {
    const res = await fetch('https://api.github.com/rate_limit', {
      headers: makeHeaders(token),
    });
    if (res.ok) {
      pingPass = true;
      const data = await res.json() as any;
      checks.push({
        name: 'agent.github.apiToken',
        layer: 3,
        category: 'tool',
        status: 'pass',
        durationMs: Date.now() - overallStart,
        message: `GitHub API reachable (${data?.resources?.core?.remaining ?? 'unknown'} requests remaining)`,
      });
    } else {
      checks.push({
        name: 'agent.github.apiToken',
        layer: 3,
        category: 'tool',
        status: 'fail',
        durationMs: Date.now() - overallStart,
        message: `GitHub API error (HTTP ${res.status})`,
      });
    }
  } catch (e: any) {
    checks.push({
      name: 'agent.github.apiToken',
      layer: 3,
      category: 'tool',
      status: 'fail',
      durationMs: Date.now() - overallStart,
      message: 'GitHub API reachability check failed',
      error: e.message,
    });
  }

  if (mode === 'fast' || !pingPass) {
    return checks; // Skip deep tests if fast mode or if API is unreachable
  }

  // --- Deep Tests: Webhooks ---
  const owner = env.GITHUB_OWNER ?? 'jmbish04';
  const repo = env.HEALTH_TEST_REPO_NAME ?? 'testing-oktokit-commands';
  
  let pat: string;
  try {
    pat = (await getSecret(env, 'GITHUB_PERSONAL_ACCESS_TOKEN')) || '';
    if (!pat) throw new Error('No PAT configured');
  } catch (e) {
    logger.warn('Skipping webhook health tests: no GITHUB_PERSONAL_ACCESS_TOKEN found.');
    return checks;
  }

  // 2. Unsupported / Skipped Events
  const skippedEvents = ['agent.github.webhook.fork', 'agent.github.webhook.installation'];
  for (const name of skippedEvents) {
    checks.push({
      name,
      layer: 3,
      category: 'custom',
      status: 'skip',
      durationMs: 0,
      message: 'Cannot be triggered programmatically from self-owned OAuth flow',
    });
  }

  // The tests create temporary resources that we must clean up
  const branchName = `gh-agent-health/${Date.now()}`;
  let issueNumber: number | null = null;
  let prNumber: number | null = null;
  let releaseId: number | null = null;

  try {
    // --- PUSH EVENT ---
    let start = Date.now();
    try {
      const baseShaData = await getRef(env as any, { owner, repo, ref: 'heads/main' });
      const baseSha = (baseShaData as any).object?.sha || (baseShaData as any).sha;
      await createBranch(env as any, { owner, repo, branch: branchName, sha: baseSha });
      await createOrUpdateFile(env as any, {
        owner, repo, branch: branchName,
        path: '.health/github-agent-test.md',
        content: `# Webhook Health Check ${Date.now()}`,
        message: 'chore: trigger push event webhook',
      });
      
      const { found } = await pollForEvent(agent, start, 'push');
      checks.push({
        name: 'agent.github.webhook.push',
        layer: 3,
        category: 'custom',
        status: found ? 'pass' : 'fail',
        durationMs: Date.now() - start,
        message: found ? 'Push event received' : 'Timeout waiting for push event',
      });
    } catch (e: any) {
      checks.push({ name: 'agent.github.webhook.push', layer: 3, category: 'custom', status: 'fail', durationMs: Date.now() - start, message: e.message });
    }

    // --- ISSUE EVENTS ---
    start = Date.now();
    try {
      const issueResp = await ghFetch(pat, `https://api.github.com/repos/${owner}/${repo}/issues`, {
        method: 'POST', body: JSON.stringify({ title: '[Health Check] Webhook Issue', body: 'Test issue for webhook verification' })
      });
      if (!issueResp.ok) throw new Error(`Issue creation failed: ${issueResp.status}`);
      issueNumber = ((await issueResp.json()) as any).number;

      let { found } = await pollForEvent(agent, start, 'issues', 'opened');
      checks.push({
        name: 'agent.github.webhook.issues.opened',
        layer: 3, category: 'custom', status: found ? 'pass' : 'fail', durationMs: Date.now() - start,
        message: found ? 'Issues (opened) received' : 'Timeout waiting for issues.opened',
      });

      // --- ISSUE COMMENT EVENT ---
      let subStart = Date.now();
      await ghFetch(pat, `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
        method: 'POST', body: JSON.stringify({ body: 'Triggering issue_comment webhook' })
      });
      let result = await pollForEvent(agent, subStart, 'issue_comment', 'created');
      checks.push({
        name: 'agent.github.webhook.issue_comment',
        layer: 3, category: 'custom', status: result.found ? 'pass' : 'fail', durationMs: Date.now() - subStart,
        message: result.found ? 'issue_comment recevied' : 'Timeout waiting for issue_comment.created',
      });

      // --- ISSUE CLOSED EVENT ---
      subStart = Date.now();
      await ghFetch(pat, `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`, {
        method: 'PATCH', body: JSON.stringify({ state: 'closed' })
      });
      result = await pollForEvent(agent, subStart, 'issues', 'closed');
      checks.push({
        name: 'agent.github.webhook.issues.closed',
        layer: 3, category: 'custom', status: result.found ? 'pass' : 'fail', durationMs: Date.now() - subStart,
        message: result.found ? 'Issues (closed) recevied' : 'Timeout waiting for issues.closed',
      });
    } catch (e: any) {
      checks.push({ name: 'agent.github.webhook.issues', layer: 3, category: 'custom', status: 'fail', durationMs: Date.now() - start, message: e.message });
    }

    // --- PULL REQUEST EVENTS ---
    start = Date.now();
    try {
      const prResp = await ghFetch(pat, `https://api.github.com/repos/${owner}/${repo}/pulls`, {
        method: 'POST', body: JSON.stringify({ title: '[Health Check] Webhook PR', head: branchName, base: 'main' })
      });
      if (!prResp.ok) throw new Error(`PR creation failed: ${prResp.status}`);
      prNumber = ((await prResp.json()) as any).number;

      let { found } = await pollForEvent(agent, start, 'pull_request', 'opened');
      checks.push({
        name: 'agent.github.webhook.pull_request.opened',
        layer: 3, category: 'custom', status: found ? 'pass' : 'fail', durationMs: Date.now() - start,
        message: found ? 'pull_request (opened) received' : 'Timeout waiting for pull_request.opened',
      });

      // --- PULL REQUEST CLOSED EVENT ---
      let subStart = Date.now();
      await ghFetch(pat, `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`, {
        method: 'PATCH', body: JSON.stringify({ state: 'closed' })
      });
      // We don't verify 'closed' rigidly if we just fail silently, but let's poll:
      let result = await pollForEvent(agent, subStart, 'pull_request', 'closed');
      checks.push({
        name: 'agent.github.webhook.pull_request.closed',
        layer: 3, category: 'custom', status: result.found ? 'pass' : 'fail', durationMs: Date.now() - subStart,
        message: result.found ? 'pull_request (closed) recevied' : 'Timeout waiting for pull_request.closed',
      });
    } catch (e: any) {
      checks.push({ name: 'agent.github.webhook.pull_request', layer: 3, category: 'custom', status: 'fail', durationMs: Date.now() - start, message: e.message });
    }

    // --- STAR EVENTS ---
    start = Date.now();
    try {
      // Unstar first just in case
      await ghFetch(pat, `https://api.github.com/user/starred/${owner}/${repo}`, { method: 'DELETE' });
      // Minor wait
      await new Promise(r => setTimeout(r, 1000));
      
      let subStart = Date.now();
      await ghFetch(pat, `https://api.github.com/user/starred/${owner}/${repo}`, { method: 'PUT', headers: { 'Content-Length': '0' } });
      const { found } = await pollForEvent(agent, subStart, 'star', 'created');
      
      checks.push({
        name: 'agent.github.webhook.star.created',
        layer: 3, category: 'custom', status: found ? 'pass' : 'fail', durationMs: Date.now() - subStart,
        message: found ? 'Star (created) received' : 'Timeout waiting for star.created',
      });

      // And delete it to leave clean state (can check deleted too)
      subStart = Date.now();
      await ghFetch(pat, `https://api.github.com/user/starred/${owner}/${repo}`, { method: 'DELETE' });
      const delResult = await pollForEvent(agent, subStart, 'star', 'deleted');
      checks.push({
        name: 'agent.github.webhook.star.deleted',
        layer: 3, category: 'custom', status: delResult.found ? 'pass' : 'fail', durationMs: Date.now() - subStart,
        message: delResult.found ? 'Star (deleted) received' : 'Timeout waiting for star.deleted',
      });
    } catch (e: any) {
      checks.push({ name: 'agent.github.webhook.star', layer: 3, category: 'custom', status: 'fail', durationMs: Date.now() - start, message: e.message });
    }

    // --- RELEASE EVENTS ---
    start = Date.now();
    try {
      const relResp = await ghFetch(pat, `https://api.github.com/repos/${owner}/${repo}/releases`, {
        method: 'POST', body: JSON.stringify({ tag_name: `health-${Date.now()}`, name: 'Health Check Release', draft: false })
      });
      if (relResp.ok) {
        releaseId = ((await relResp.json()) as any).id;
        const { found } = await pollForEvent(agent, start, 'release', 'published');
        checks.push({
          name: 'agent.github.webhook.release.published',
          layer: 3, category: 'custom', status: found ? 'pass' : 'fail', durationMs: Date.now() - start,
          message: found ? 'Release (published) received' : 'Timeout waiting for release.published',
        });
      }
    } catch (e: any) {
      checks.push({ name: 'agent.github.webhook.release', layer: 3, category: 'custom', status: 'fail', durationMs: Date.now() - start, message: e.message });
    }

  } finally {
    // --- CLEANUP ---
    try {
      if (prNumber) {
        await ghFetch(pat, `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`, {
          method: 'PATCH', body: JSON.stringify({ state: 'closed' })
        });
      }
      if (issueNumber) {
        await ghFetch(pat, `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`, {
          method: 'PATCH', body: JSON.stringify({ state: 'closed' })
        });
      }
      if (releaseId) {
        await ghFetch(pat, `https://api.github.com/repos/${owner}/${repo}/releases/${releaseId}`, { method: 'DELETE' });
      }
      // Delete branch
      await ghFetch(pat, `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branchName)}`, { method: 'DELETE' });
    } catch (cleanupErr) {
      logger.warn(`Cleanup failed: ${String(cleanupErr)}`);
    }
  }

  return checks;
}

export async function healthProbe(agent: GithubAgent) {
  return {
    status: 'ok' as const,
    agent: 'GithubAgent',
    timestamp: new Date().toISOString(),
    capabilities: ['owner', 'repo', 'pr-reviewer', 'webhook-handler'],
  };
}
