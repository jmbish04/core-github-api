import type { D1Database } from '@cloudflare/workers-types';

export interface PushContext {
  env: Env;
  executionCtx: ExecutionContext;
  repo: {
    owner: string;
    name: string;
    defaultBranch: string;
  };
  octokit: any;
}

export type GardenerContext = PushContext;

export interface RepoFingerprint {
  stack: 'cloudflare-worker' | 'nextjs' | 'python' | 'unknown';
  framework: 'hono' | 'react' | 'none' | 'unknown';
  hasWranglerToml: boolean;
  hasWranglerJson: boolean;
  hasPublicDir: boolean;
  hasTests: boolean;
  bindings: {
    d1: boolean;
    kv: boolean;
    r2: boolean;
    ai: boolean;
  };
}

export type AuditSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface AuditResult {
  ruleId: string;
  description: string;
  severity: AuditSeverity;
  filePath?: string;
  line?: number;
  context?: string;
}

export interface Fixer {
  id: string;
  name: string;
  description: string;
  canFix(audit: AuditResult): boolean;
  execute(ctx: PushContext, audit: AuditResult): Promise<boolean>;
}

export interface CommandResult {
  type: 'reply' | 'ignore';
  body?: string;
}

export interface ISlashCommand {
  name: string;
  aliases?: string[];
  description: string;
  handle(
    args: string,
    ctx: PushContext,
    metadata: { issueNumber?: number; issueBody?: string },
  ): Promise<CommandResult | null>;
}

export class WorkerTypesFixer implements Fixer {
  id = 'fix-worker-types';
  name = 'Worker Type Standardizer';
  description = 'Replaces manual @cloudflare/workers-types imports with the global Env interface.';

  canFix(audit: AuditResult): boolean {
    return audit.ruleId === 'no-explicit-worker-types';
  }

  async execute(ctx: PushContext, audit: AuditResult): Promise<boolean> {
    console.log(`[WorkerTypesFixer] Fixing ${audit.filePath}...`);

    try {
      const { data: fileData } = await ctx.octokit.repos.getContent({
        owner: ctx.repo.owner,
        repo: ctx.repo.name,
        path: audit.filePath!,
      });

      if (Array.isArray(fileData) || fileData.type !== 'file' || !fileData.content) {
        console.error(`[WorkerTypesFixer] Could not read file content for ${audit.filePath}`);
        return false;
      }

      const currentContent = atob(fileData.content);
      const newContent = currentContent.replace(
        /import\s+.*from\s+['"]@cloudflare\/workers-types['"][;]?\n?/g,
        '',
      );

      if (newContent === currentContent) {
        console.log('[WorkerTypesFixer] No changes made by heuristic.');
        return false;
      }

      const branchName = `push/fix-types-${Date.now()}`;
      const prTitle = `fix: standardize worker types usage in ${audit.filePath}`;
      const prBody = `This PR removes manual imports of \`@cloudflare/workers-types\` and adopts the global \`Env\` interface pattern.

Detected via push audit rule: \`no-explicit-worker-types\`.`;

      const { data: refData } = await ctx.octokit.git.getRef({
        owner: ctx.repo.owner,
        repo: ctx.repo.name,
        ref: `heads/${ctx.repo.defaultBranch}`,
      });

      await ctx.octokit.git.createRef({
        owner: ctx.repo.owner,
        repo: ctx.repo.name,
        ref: `refs/heads/${branchName}`,
        sha: refData.object.sha,
      });

      await ctx.octokit.repos.createOrUpdateFileContents({
        owner: ctx.repo.owner,
        repo: ctx.repo.name,
        path: audit.filePath!,
        message: prTitle,
        content: btoa(newContent),
        branch: branchName,
        sha: fileData.sha,
      });

      const { data: pr } = await ctx.octokit.pulls.create({
        owner: ctx.repo.owner,
        repo: ctx.repo.name,
        title: prTitle,
        head: branchName,
        base: ctx.repo.defaultBranch,
        body: prBody,
      });

      console.log(`[WorkerTypesFixer] PR Created: ${pr.html_url}`);
      return true;
    } catch (error) {
      console.error('[WorkerTypesFixer] Execution failed:', error);
      return false;
    }
  }

  async fixAll(ctx: PushContext): Promise<string> {
    console.log('[WorkerTypesFixer] Running fixAll...');

    try {
      const query = `repo:${ctx.repo.owner}/${ctx.repo.name} "@cloudflare/workers-types" extension:ts`;
      const { data: search } = await ctx.octokit.search.code({ q: query });

      if (search.total_count === 0) {
        return '✅ No manual worker type imports found. Good job!';
      }

      const branchName = `push/fix-types-all-${Date.now()}`;
      const { data: refData } = await ctx.octokit.git.getRef({
        owner: ctx.repo.owner,
        repo: ctx.repo.name,
        ref: `heads/${ctx.repo.defaultBranch}`,
      });

      await ctx.octokit.git.createRef({
        owner: ctx.repo.owner,
        repo: ctx.repo.name,
        ref: `refs/heads/${branchName}`,
        sha: refData.object.sha,
      });

      let fixedCount = 0;
      const files = search.items.slice(0, 10);

      for (const file of files) {
        if (file.path.endsWith('worker-configuration.d.ts')) continue;

        const { data: fileData } = await ctx.octokit.repos.getContent({
          owner: ctx.repo.owner,
          repo: ctx.repo.name,
          path: file.path,
        });

        if (Array.isArray(fileData) || !fileData.content) continue;
        const content = atob(fileData.content);
        const newContent = content.replace(
          /import\s+.*from\s+['"]@cloudflare\/workers-types['"][;]?\n?/g,
          '',
        );

        if (newContent !== content) {
          await ctx.octokit.repos.createOrUpdateFileContents({
            owner: ctx.repo.owner,
            repo: ctx.repo.name,
            path: file.path,
            message: `fix: standardize worker types in ${file.path}`,
            content: btoa(newContent),
            branch: branchName,
            sha: fileData.sha,
          });
          fixedCount++;
        }
      }

      if (fixedCount === 0) {
        return '⚠️ Found files but could not automagically fix them.';
      }

      const { data: pr } = await ctx.octokit.pulls.create({
        owner: ctx.repo.owner,
        repo: ctx.repo.name,
        title: 'fix: standardize worker types (automated)',
        head: branchName,
        base: ctx.repo.defaultBranch,
        body: `Found ${search.total_count} files. Automated fix applied to ${fixedCount} files.`,
      });

      return `🧹 **Cleanup Run**: Found ${search.total_count} files, fixed ${fixedCount}. PR Created: ${pr.html_url}`;
    } catch (error: any) {
      console.error('[WorkerTypesFixer] fixAll failed', error);
      return `❌ **Fix Failed**: ${error.message}`;
    }
  }
}

export const WorkerTypeFixer = WorkerTypesFixer;

export const FixTypesCommand: ISlashCommand = {
  name: 'fix-types',
  description: 'Remove manual @cloudflare/workers-types imports.',
  async handle(_args, ctx): Promise<CommandResult | null> {
    const fixer = new WorkerTypesFixer();
    const result = await fixer.fixAll(ctx);
    return { type: 'reply', body: result };
  },
};
