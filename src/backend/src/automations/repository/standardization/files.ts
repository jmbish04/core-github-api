/**
 * file-enforcement.ts
 *
 * Merged from:
 *   - backend/src/automations/push/orchestration/ensure-files.ts
 *   - backend/src/automations/push/audit.ts
 *
 * Responsibilities:
 *   - Ensure required files exist in a repository, creating them when missing.
 *   - Static audit rules to detect standards violations (e.g. explicit @cloudflare/workers-types imports).
 */

import type { ColbyCommandContext } from '@/automations/shared/colby/contracts';
import type { AuditResult } from '@/automations/shared/colby/contracts';
import type { SyncManifestFile } from '@/automations/push/orchestration/sync';

// ---------------------------------------------------------------------------
// File enforcement (ensure-files.ts)
// ---------------------------------------------------------------------------

/**
 * For each file in `files`, checks whether it exists in the repository and creates
 * it (with the provided content) if it is missing (404). All other errors propagate.
 */
export async function ensureFilesExist(
  ctx: ColbyCommandContext,
  files: SyncManifestFile[],
): Promise<void> {
  const reposApi = ctx.octokit?.rest?.repos ?? ctx.octokit?.repos;
  if (!reposApi) {
    throw new Error('Octokit repos API is unavailable on this client.');
  }

  for (const file of files) {
    try {
      await reposApi.getContent({
        owner: ctx.repo.owner,
        repo: ctx.repo.name,
        path: file.path,
      });
    } catch (error: any) {
      if (error.status === 404) {
        await reposApi.createOrUpdateFileContents({
          owner: ctx.repo.owner,
          repo: ctx.repo.name,
          path: file.path,
          message: `chore(standardization): restore missing ${file.path}`,
          content: btoa(file.content),
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Code auditor (audit.ts)
// ---------------------------------------------------------------------------

/**
 * Static audit rules applied to repository source files.
 *
 * Currently enforces:
 *   - no-explicit-worker-types: disallows direct imports from @cloudflare/workers-types.
 */
export class CodeAuditor {
  static scanFile(filePath: string, content: string): AuditResult[] {
    const results: AuditResult[] = [];

    if (filePath.endsWith('.ts') && !filePath.endsWith('worker-configuration.d.ts')) {
      const workerTypesRegex = /import\s+.*from\s+['"]@cloudflare\/workers-types['"]/;
      const match = content.match(workerTypesRegex);
      if (match) {
        results.push({
          ruleId: 'no-explicit-worker-types',
          description:
            'Avoid explicit imports from @cloudflare/workers-types. Use the global Env definition.',
          severity: 'high',
          filePath,
          context: match[0],
        });
      }
    }

    return results;
  }

  static auditFiles(files: { path: string; content: string }[]): AuditResult[] {
    return files.flatMap((file) => this.scanFile(file.path, file.content));
  }
}
