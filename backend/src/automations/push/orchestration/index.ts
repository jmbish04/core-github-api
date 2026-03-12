import type { Context } from 'hono';
import { eq } from 'drizzle-orm';
import { getDb } from '@db';
import { repositories } from '@db/schemas/github/repos';
import { fetchTemplateFiles } from '@/ai/mcp/tools/github/templates';
import type { AuditResult, ColbyCommandContext } from '@/automations/shared/colby/contracts';
import { WorkerTypesFixer } from '@/automations/shared/colby/fixers/types';
import { CodeAuditor, ensureFilesExist } from '@/automations/repository/standardization/files';
import { buildSyncManifest } from './sync';
import { applySyncSecrets } from './sync/secrets';
import { syncStandardizationPullRequest } from './sync/pull-request';

const FIXERS = [new WorkerTypesFixer()];
const STANDARDIZATION_SYNC_BRANCH = 'automation/standardization-sync';

function getReposApi(octokit: any): any {
  const reposApi = octokit?.repos ?? octokit?.rest?.repos;
  if (!reposApi) {
    throw new Error('Octokit repos API is unavailable on this client.');
  }
  return reposApi;
}

function createPushContext(c: Context, octokit: any, payload: any): ColbyCommandContext {
  return {
    env: c.env,
    executionCtx: c.executionCtx as unknown as ExecutionContext,
    octokit,
    installationId: payload.installation?.id,
    repo: {
      owner: payload.repository.owner.login || payload.repository.owner.name,
      name: payload.repository.name,
      defaultBranch: payload.repository.default_branch,
    },
    thread: {
      kind: 'pull_request',
      number: 0,
      isPullRequest: true,
    },
    source: {
      eventName: 'push',
      action: null,
    },
  };
}

export class GardenerOrchestrator {
  static async handlePushEvent(c: Context, octokit: any, payload: any) {
    const reposApi = getReposApi(octokit);
    const commitSha = payload.after;
    const ctx = createPushContext(c, octokit, payload);
    const db = getDb(c.env.DB);

    const [repoData] = await db
      .select()
      .from(repositories)
      .where(eq(repositories.id, `github:${ctx.repo.owner}/${ctx.repo.name}`));

    if (repoData?.infrastructure) {
      const standardFiles = await fetchTemplateFiles(c.env, repoData.infrastructure, ctx.repo.name);
      await ensureFilesExist(
        ctx,
        Object.entries(standardFiles).map(([path, content]) => ({ path, content })),
      );
    }

    const manifest = await buildSyncManifest(c.env, octokit, {
      owner: ctx.repo.owner,
      name: ctx.repo.name,
      defaultBranch: ctx.repo.defaultBranch,
      description: repoData?.description || null,
    });

    await ensureFilesExist(
      ctx,
      manifest.files.filter(
        (file) =>
          file.path === 'mcp.json' ||
          file.path === '.github/copilot/mcp.json' ||
          file.path === '.github/agents/repo-specialist.agent.md' ||
          file.path === 'AGENTS.md',
      ),
    );
    await applySyncSecrets(ctx);
    await syncStandardizationPullRequest(ctx, manifest, STANDARDIZATION_SYNC_BRANCH);

    try {
      const { data: commit } = await reposApi.getCommit({
        owner: ctx.repo.owner,
        repo: ctx.repo.name,
        ref: commitSha,
      });

      const files = commit.files || [];
      const results: AuditResult[] = [];

      for (const file of files) {
        if (file.status === 'removed' || !file.filename.endsWith('.ts')) {
          continue;
        }

        const { data: fileContent } = await reposApi.getContent({
          owner: ctx.repo.owner,
          repo: ctx.repo.name,
          path: file.filename,
          ref: commitSha,
        });

        if ('content' in fileContent) {
          const decoded = atob(fileContent.content);
          results.push(...CodeAuditor.scanFile(file.filename, decoded));
        }
      }

      for (const issue of results) {
        const fixer = FIXERS.find((candidate) => candidate.canFix(issue));
        if (fixer) {
          await fixer.execute(ctx, issue);
        }
      }
    } catch (error) {
      console.error('[Gardener] Error in orchestration:', error);
    }
  }
}
