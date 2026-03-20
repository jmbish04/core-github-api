import type { ColbyCommandContext } from '@/automations/shared/colby/contracts';
import { applySyncManifestToBranch, type SyncManifest } from './index';

async function ensureSyncBranch(octokit: any, ctx: ColbyCommandContext, syncBranch: string): Promise<void> {
  try {
    await octokit.rest.git.getRef({
      owner: ctx.repo.owner,
      repo: ctx.repo.name,
      ref: `heads/${syncBranch}`,
    });
  } catch (error: any) {
    if (error.status !== 404) {
      throw error;
    }

    const { data: baseRef } = await octokit.rest.git.getRef({
      owner: ctx.repo.owner,
      repo: ctx.repo.name,
      ref: `heads/${ctx.repo.defaultBranch}`,
    });

    await octokit.rest.git.createRef({
      owner: ctx.repo.owner,
      repo: ctx.repo.name,
      ref: `refs/heads/${syncBranch}`,
      sha: baseRef.object.sha,
    });
  }
}

export async function syncStandardizationPullRequest(
  ctx: ColbyCommandContext,
  manifest: SyncManifest,
  syncBranch: string,
): Promise<{ changedPaths: string[]; pullRequestUrl?: string }> {
  await ensureSyncBranch(ctx.octokit, ctx, syncBranch);

  const changedPaths = await applySyncManifestToBranch(
    ctx.octokit,
    {
      owner: ctx.repo.owner,
      name: ctx.repo.name,
      defaultBranch: ctx.repo.defaultBranch,
    },
    syncBranch,
    manifest,
  );

  if (!changedPaths.length) {
    return { changedPaths };
  }

  const existingPullRequests = await ctx.octokit.rest.pulls.list({
    owner: ctx.repo.owner,
    repo: ctx.repo.name,
    state: 'open',
    head: `${ctx.repo.owner}:${syncBranch}`,
  });

  if (existingPullRequests.data.length > 0) {
    return {
      changedPaths,
      pullRequestUrl: existingPullRequests.data[0].html_url,
    };
  }

  const pullRequest = await ctx.octokit.rest.pulls.create({
    owner: ctx.repo.owner,
    repo: ctx.repo.name,
    title: 'chore: sync repository automation assets',
    head: syncBranch,
    base: ctx.repo.defaultBranch,
    body: `Synchronizes the tracked automation assets maintained by the Gardener orchestration.\n\nUpdated files:\n${changedPaths.map((path) => `- \`${path}\``).join('\n')}`,
  });

  return {
    changedPaths,
    pullRequestUrl: pullRequest.data.html_url,
  };
}
