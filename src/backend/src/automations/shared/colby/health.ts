/**
 * @file src/backend/src/automations/shared/colby/health.ts
 * @description Health check for the /colby and @colby slash command system.
 *
 * Opens a real PR against HEALTH_TEST_REPO_NAME using the user PAT so the
 * GitHub webhook fires as a human user (required for the slash command dispatcher
 * to trigger). Posts `/colby help`, polls for the Worker bot reply, then cleans
 * up. Results are persisted to D1 via the health coordinator.
 */

import { HealthStepResult } from '@/health/types';
import { getRef, createBranch, createOrUpdateFile } from '@/ai/mcp/tools/github/github';
import { Logger } from '@/lib/logger';

const TEST_LABEL = 'slash-command-test';
const STALE_MS = 2 * 24 * 60 * 60 * 1000; // 2 days
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 90_000;

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getUserPat(env: Env): Promise<string> {
  if (!env.GITHUB_PERSONAL_ACCESS_TOKEN) {
    throw new Error('GITHUB_PERSONAL_ACCESS_TOKEN binding is missing');
  }
  return env.GITHUB_PERSONAL_ACCESS_TOKEN.get();
}

function makeHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'Cloudflare-Worker-ColbyHealthCheck',
    'Content-Type': 'application/json',
  };
}

async function ghFetch(token: string, url: string, options?: RequestInit): Promise<Response> {
  const resp = await fetch(url, {
    ...options,
    headers: { ...makeHeaders(token), ...(options?.headers ? options.headers : {}) },
  });
  return resp;
}

// ─── Stale PR Cleanup ───────────────────────────────────────────────────────

async function closeStaleTestPRs(
  env: Env,
  owner: string,
  repo: string,
  token: string,
  logger: Logger,
): Promise<number> {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=50`;
  const resp = await ghFetch(token, url);
  if (!resp.ok) {
    logger.warn(`Failed to list PRs: ${resp.status}`);
    return 0;
  }

  const prs = (await resp.json()) as any[];
  const cutoff = Date.now() - STALE_MS;
  let closed = 0;

  for (const pr of prs) {
    const hasLabel = (pr.labels ?? []).some((l: any) => l.name === TEST_LABEL);
    if (!hasLabel) continue;

    const createdAt = new Date(pr.created_at).getTime();
    if (createdAt > cutoff) continue;

    // Close PR
    const closeResp = await ghFetch(token, `https://api.github.com/repos/${owner}/${repo}/pulls/${pr.number}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed' }),
    });
    if (!closeResp.ok) {
      logger.warn(`Failed to close stale PR #${pr.number}: ${closeResp.status}`);
      continue;
    }

    // Delete branch
    const branchName = pr.head?.ref;
    if (branchName) {
      await ghFetch(token, `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branchName)}`, {
        method: 'DELETE',
      });
    }

    logger.info(`Closed stale test PR #${pr.number}`);
    closed++;
  }

  return closed;
}

// ─── Ensure Label Exists ─────────────────────────────────────────────────────

async function ensureLabelExists(owner: string, repo: string, token: string): Promise<void> {
  const url = `https://api.github.com/repos/${owner}/${repo}/labels/${encodeURIComponent(TEST_LABEL)}`;
  const checkResp = await ghFetch(token, url);
  if (checkResp.ok) return;

  // Create label
  await ghFetch(token, `https://api.github.com/repos/${owner}/${repo}/labels`, {
    method: 'POST',
    body: JSON.stringify({ name: TEST_LABEL, color: '0075ca', description: 'Automated slash command health test PR' }),
  });
}

// ─── Create Test Branch + PR ─────────────────────────────────────────────────

async function createTestBranchAndPR(
  env: Env,
  owner: string,
  repo: string,
  token: string,
  branchName: string,
  logger: Logger,
): Promise<number> {
  // 1. Get base SHA from default branch
  const baseSha = await getRef(env, owner, repo, 'heads/main');

  // 2. Create branch
  await createBranch(env, owner, repo, branchName, baseSha);
  logger.info(`Created branch: ${branchName}`);

  // 3. Commit marker file
  const fileContent = `# Slash Command Health Check\n\nBranch: ${branchName}\nCreated: ${new Date().toISOString()}\n`;
  await createOrUpdateFile(
    env,
    owner,
    repo,
    '.health/slash-cmd-test.md',
    fileContent,
    'chore: add slash command health check marker',
    branchName,
  );
  logger.info('Committed marker file');

  // 4. Open PR using user PAT (so webhook fires as user)
  const prResp = await ghFetch(token, `https://api.github.com/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      title: `[Health Check] Slash Command Test — ${new Date().toISOString()}`,
      head: branchName,
      base: 'main',
      body: 'Automated health check PR — validates /colby slash command dispatch. Do not merge.',
    }),
  });

  if (!prResp.ok) {
    const err = await prResp.text();
    throw new Error(`Failed to open PR: ${prResp.status} ${err}`);
  }

  const pr = (await prResp.json()) as any;
  const prNumber: number = pr.number;
  logger.info(`Opened PR #${prNumber}: ${pr.html_url}`);

  // 5. Apply label
  await ensureLabelExists(owner, repo, token);
  await ghFetch(token, `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/labels`, {
    method: 'POST',
    body: JSON.stringify({ labels: [TEST_LABEL] }),
  });

  return prNumber;
}

// ─── Post Slash Command Comment ───────────────────────────────────────────────

async function postSlashCommandComment(
  owner: string,
  repo: string,
  prNumber: number,
  token: string,
  logger: Logger,
): Promise<void> {
  const resp = await ghFetch(token, `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body: '/colby help' }),
  });

  if (!resp.ok) {
    throw new Error(`Failed to post /colby help comment: ${resp.status} ${await resp.text()}`);
  }
  logger.info('Posted /colby help comment');
}

// ─── Poll for Worker Reply ────────────────────────────────────────────────────

async function pollForBotReply(
  owner: string,
  repo: string,
  prNumber: number,
  token: string,
  logger: Logger,
): Promise<{ found: boolean; commentUrl?: string }> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    const resp = await ghFetch(
      token,
      `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=50`,
    );

    if (!resp.ok) {
      logger.warn(`Poll failed: ${resp.status}`);
      continue;
    }

    const comments = (await resp.json()) as any[];

    // Look for the bot reply — it contains the Colby help table
    const botComment = comments.find(
      (c: any) =>
        typeof c.body === 'string' &&
        c.body.includes('## Colby Commands') &&
        c.user?.login !== undefined &&
        // Accept any bot-type login (github-actions, app bot, etc.)
        (c.user.type === 'Bot' || c.user.login.endsWith('[bot]') || c.user.login.endsWith('-bot')),
    );

    if (botComment) {
      logger.info(`Bot reply found from ${botComment.user.login} at ${botComment.html_url}`);
      return { found: true, commentUrl: botComment.html_url };
    }

    logger.info(`Polling... (${Math.round((deadline - Date.now()) / 1000)}s remaining)`);
  }

  return { found: false };
}

// ─── Cleanup Test PR ──────────────────────────────────────────────────────────

async function closeTestPR(
  owner: string,
  repo: string,
  prNumber: number,
  branchName: string,
  token: string,
  logger: Logger,
): Promise<void> {
  const closeResp = await ghFetch(token, `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`, {
    method: 'PATCH',
    body: JSON.stringify({ state: 'closed' }),
  });

  if (!closeResp.ok) {
    logger.warn(`Could not close PR #${prNumber}: ${closeResp.status}`);
  } else {
    logger.info(`Closed test PR #${prNumber}`);
  }

  // Delete branch
  const delResp = await ghFetch(
    token,
    `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branchName)}`,
    { method: 'DELETE' },
  );

  if (!delResp.ok && delResp.status !== 422) {
    logger.warn(`Could not delete branch ${branchName}: ${delResp.status}`);
  } else {
    logger.info(`Deleted branch: ${branchName}`);
  }
}

// ─── Main Health Check ────────────────────────────────────────────────────────

export async function checkHealth(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  const logger = new Logger(env, 'health/slash-commands');
  const owner = env.GITHUB_OWNER ?? 'jmbish04';
  const repo = env.HEALTH_TEST_REPO_NAME ?? 'testing-oktokit-commands';
  const details: Record<string, any> = { owner, repo };

  let token: string;
  try {
    token = await getUserPat(env);
  } catch (e: any) {
    return {
      name: 'Slash Commands',
      status: 'SKIPPED',
      message: `Skipped — ${e.message}`,
      durationMs: Date.now() - start,
      details,
    };
  }

  let prNumber: number | null = null;
  const branchName = `slash-cmd-health/${Date.now()}`;

  try {
    // 1. Close stale test PRs first
    const staleClosed = await closeStaleTestPRs(env, owner, repo, token, logger);
    details.staleClosedCount = staleClosed;

    // 2. Create branch + PR using user auth
    prNumber = await createTestBranchAndPR(env, owner, repo, token, branchName, logger);
    details.prNumber = prNumber;

    // 3. Post /colby help
    await postSlashCommandComment(owner, repo, prNumber, token, logger);
    details.commandPosted = '/colby help';

    // 4. Poll for worker bot reply
    const { found, commentUrl } = await pollForBotReply(owner, repo, prNumber, token, logger);
    details.botReplyFound = found;
    details.botCommentUrl = commentUrl ?? null;

    if (!found) {
      // Leave PR open for inspection
      details.prUrl = `https://github.com/${owner}/${repo}/pull/${prNumber}`;
      return {
        name: 'Slash Commands',
        status: 'failure',
        message: `No bot reply within ${POLL_TIMEOUT_MS / 1000}s — PR #${prNumber} left open for inspection`,
        durationMs: Date.now() - start,
        details,
      };
    }

    // 5. Close PR — test passed
    await closeTestPR(owner, repo, prNumber, branchName, token, logger);

    return {
      name: 'Slash Commands',
      status: 'success',
      message: `Bot replied to /colby help on PR #${prNumber} ✓`,
      durationMs: Date.now() - start,
      details,
    };
  } catch (e: any) {
    logger.error('Slash command health check failed', { error: e.message });
    details.error = e.message;
    details.prNumber = prNumber;

    return {
      name: 'Slash Commands',
      status: 'failure',
      message: e.message,
      durationMs: Date.now() - start,
      details,
    };
  }
}
