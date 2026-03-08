import type { Context } from 'hono';
import { getDb } from '@db';
import { repositories } from '@db/schemas/github/repos';
import { eq } from 'drizzle-orm';
import { fetchTemplateFiles } from '@/ai/mcp/tools/github/templates';
import { CodeAuditor } from '../auditor';
import { WorkerTypesFixer, type AuditResult, type PushContext } from '../fixers/worker_types';
import { ensureFilesExist } from './ensure_files_exist';
import { syncMcpAndSecrets } from './sync_mcp_and_secrets';
import { syncStandardizationFilesPr } from './sync_standardization_pull_request';

const FIXERS = [new WorkerTypesFixer()];

function getReposApi(octokit: any): any {
  const reposApi = octokit?.repos ?? octokit?.rest?.repos;
  if (!reposApi) {
    throw new Error('Octokit repos API is unavailable on this client.');
  }
  return reposApi;
}

export class GardenerOrchestrator {
  static async handlePushEvent(c: Context, octokit: any, payload: any) {
    const reposApi = getReposApi(octokit);
    const repo = payload.repository;
    const commitSha = payload.after;
    const db = getDb(c.env.DB);

    console.log(`[Gardener] Analyzing push to ${repo.full_name} (${commitSha})`);

    const ctx: PushContext = {
      env: c.env,
      executionCtx: c.executionCtx as any,
      repo: {
        owner: repo.owner.login || repo.owner.name,
        name: repo.name,
        defaultBranch: repo.default_branch,
      },
      octokit,
      installationId: payload.installation?.id,
    };

    const [repoData] = await db
      .select()
      .from(repositories)
      .where(eq(repositories.id, `github:${ctx.repo.owner}/${ctx.repo.name}`));

    if (repoData && repoData.infrastructure) {
      console.log(`[Gardener] Checking infrastructure integrity for ${repoData.infrastructure}`);
      const standardFiles = await fetchTemplateFiles(c.env, repoData.infrastructure, ctx.repo.name);
      await ensureFilesExist(ctx, standardFiles);
    }

    await syncMcpAndSecrets(ctx);
    await syncStandardizationFilesPr(ctx);

    try {
      const { data: commit } = await reposApi.getCommit({
        owner: ctx.repo.owner,
        repo: ctx.repo.name,
        ref: commitSha,
      });

      const files = commit.files || [];
      const results: AuditResult[] = [];

      for (const file of files) {
        if (file.status === 'removed') continue;

        if (file.filename.endsWith('.ts')) {
          const { data: fileContent } = await reposApi.getContent({
            owner: ctx.repo.owner,
            repo: ctx.repo.name,
            path: file.filename,
            ref: commitSha,
          });

          if ('content' in fileContent) {
            const decoded = atob(fileContent.content);
            const fileAudits = CodeAuditor.scanFile(file.filename, decoded);
            results.push(...fileAudits);
          }
        }
      }

      console.log(`[Gardener] Audit complete. Found ${results.length} issues.`);

      for (const issue of results) {
        const fixer = FIXERS.find((candidate) => candidate.canFix(issue));
        if (fixer) {
          console.log(`[Gardener] Applying fixer: ${fixer.name}`);
          await fixer.execute(ctx, issue);
        }
      }
    } catch (error) {
      console.error('[Gardener] Error in orchestration:', error);
    }
  }
}
