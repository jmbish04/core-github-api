#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

test -d backend/src/automations

mkdir -p \
  backend/src/automations/issues/bug_hunter \
  backend/src/automations/pr/agent_tagger \
  backend/src/automations/pr/build_analyzer \
  backend/src/automations/pr/docstring_generator \
  backend/src/automations/push/orchestrator \
  backend/src/automations/push/fixers/worker_types \
  backend/src/automations/repository \
  backend/src/automations/security/leak_plumber

# 1:1 tracked renames
git mv backend/src/automations/issues/BugHunter.ts backend/src/automations/issues/bug_hunter.ts
git mv backend/src/automations/issues/JulesAutoFix.ts backend/src/automations/issues/jules_auto_fix.ts
git mv backend/src/automations/issues/SlashCommand.ts backend/src/automations/issues/slash_command.ts
git mv backend/src/automations/issues/TaskSync.ts backend/src/automations/issues/task_sync.ts
git mv backend/src/automations/issues/bug-hunter-workflow.ts backend/src/automations/issues/bug_hunter/workflow.ts

git mv backend/src/automations/pr/AgentTagger.ts backend/src/automations/pr/agent_tagger.ts
git mv backend/src/automations/pr/BuildAnalyzer.ts backend/src/automations/pr/build_analyzer.ts
git mv backend/src/automations/pr/DocstringGenerator.ts backend/src/automations/pr/docstring_generator.ts
git mv backend/src/automations/pr/GeminiReview.ts backend/src/automations/pr/gemini_review.ts
git mv backend/src/automations/pr/PRIngest.ts backend/src/automations/pr/ingest.ts
git mv backend/src/automations/pr/PRReviewExtraction.ts backend/src/automations/pr/review_extraction.ts
git mv backend/src/automations/pr/agent-tagging.ts backend/src/automations/pr/agent_tagger/tagging.ts
git mv backend/src/automations/pr/build-analysis.ts backend/src/automations/pr/build_analyzer/analysis.ts
git mv backend/src/automations/pr/docstrings.ts backend/src/automations/pr/docstring_generator/service.ts

git mv backend/src/automations/push/GardenerPush.ts backend/src/automations/push/gardener.ts
git mv backend/src/automations/push/JulesStandardsPush.ts backend/src/automations/push/jules_standards.ts
git mv backend/src/automations/push/router.ts backend/src/automations/push/command_router.ts
git mv backend/src/automations/push/specialist.ts backend/src/automations/push/repo_specialist.ts
git mv backend/src/automations/push/orchestrator.ts backend/src/automations/push/orchestrator/index.ts
git mv backend/src/automations/push/fixers/all.ts backend/src/automations/push/fixers/fix_all.ts

git mv backend/src/automations/repository/RepoSync.ts backend/src/automations/repository/sync.ts
git mv backend/src/automations/repository/StatsUpdate.ts backend/src/automations/repository/stats_update.ts
git mv backend/src/automations/repository/RepoStandardization.ts backend/src/automations/repository/standardize.ts

git mv backend/src/automations/security/LeakPlumber.ts backend/src/automations/security/leak_plumber.ts
git mv backend/src/automations/security/leak-plumber-workflow.ts backend/src/automations/security/leak_plumber/workflow.ts

git mv backend/src/automations/shared/statusMapper.ts backend/src/automations/shared/status_mapper.ts
git mv backend/src/automations/telemetry/TelemetryIngestion.ts backend/src/automations/telemetry/ingest.ts

# Split push/fixers/types.ts into focused modules
git rm backend/src/automations/push/fixers/types.ts

cat > backend/src/automations/push/fixers/worker_types/contracts.ts <<'CONTRACTS'
export interface PushContext {
  env: Env;
  executionCtx: ExecutionContext;
  repo: {
    owner: string;
    name: string;
    defaultBranch: string;
  };
  octokit: any;
  installationId?: number;
}

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
CONTRACTS

cat > backend/src/automations/push/fixers/worker_types/fixer.ts <<'FIXER'
import type { AuditResult, Fixer, PushContext } from './contracts';

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
      const prBody = `This PR removes manual imports of \`@cloudflare/workers-types\` and adopts the global \`Env\` interface pattern.\n\nDetected via push audit rule: \`no-explicit-worker-types\`.`;

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
FIXER

cat > backend/src/automations/push/fixers/worker_types/command.ts <<'COMMAND'
import type { CommandResult, ISlashCommand } from './contracts';
import { WorkerTypesFixer } from './fixer';

export const FixTypesCommand: ISlashCommand = {
  name: 'fix-types',
  description: 'Remove manual @cloudflare/workers-types imports.',
  async handle(_args, ctx): Promise<CommandResult | null> {
    const fixer = new WorkerTypesFixer();
    const result = await fixer.fixAll(ctx);
    return { type: 'reply', body: result };
  },
};
COMMAND

cat > backend/src/automations/push/fixers/worker_types/index.ts <<'INDEX'
export * from './contracts';
export * from './fixer';
export * from './command';
INDEX

# Split push/orchestrator.ts into a modular directory
cat > backend/src/automations/push/orchestrator/ensure_files_exist.ts <<'ENSURE'
import { encode } from '@utils/base64';
import type { PushContext } from '../fixers/worker_types';

export async function ensureFilesExist(ctx: PushContext, files: Record<string, string>) {
  const reposApi = ctx.octokit?.repos ?? ctx.octokit?.rest?.repos;
  if (!reposApi) {
    throw new Error('Octokit repos API is unavailable on this client.');
  }

  for (const [path, content] of Object.entries(files)) {
    try {
      await reposApi.getContent({
        owner: ctx.repo.owner,
        repo: ctx.repo.name,
        path,
      });
    } catch (error: any) {
      if (error.status === 404) {
        console.log(`[Gardener] Missing file ${path}, restoring...`);
        await reposApi.createOrUpdateFileContents({
          owner: ctx.repo.owner,
          repo: ctx.repo.name,
          path,
          message: `chore(gardener): restore missing ${path}`,
          content: encode(content),
        });
      }
    }
  }
}
ENSURE

cat > backend/src/automations/push/orchestrator/sync_mcp_and_secrets.ts <<'SECRETS'
import { REQUIRED_REPO_SECRETS } from '@/automations/repository/constants';
import type { PushContext } from '../fixers/worker_types';

export async function syncMcpAndSecrets(ctx: PushContext) {
  const octokit = ctx.octokit;
  const owner = ctx.repo.owner;
  const repo = ctx.repo.name;

  console.log(`[Gardener] Syncing Default Secrets for ${owner}/${repo}...`);

  let activeSecretKeys: string[] = [];
  try {
    const raw = await ctx.env.KV_CONFIGS.get('DEFAULT_SYNC_SECRETS');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.value)) {
        activeSecretKeys = parsed.value;
      }
    }
  } catch (error) {
    console.error('[Gardener] Failed to fetch DEFAULT_SYNC_SECRETS from KV:', error);
  }

  const finalSecretKeys = Array.from(new Set([...activeSecretKeys, ...REQUIRED_REPO_SECRETS]));
  const sodium = {
    ready: Promise.resolve(),
    from_base64: (_1: any, _2: any) => new Uint8Array(),
    from_string: (_: any) => new Uint8Array(),
    crypto_box_seal: (_1: any, _2: any) => new Uint8Array(),
    to_base64: (_1: any, _2: any) => '',
    base64_variants: { ORIGINAL: 1 },
  };

  for (const secretName of finalSecretKeys) {
    const secretValue = (ctx.env as any)[secretName];
    if (!secretValue) {
      console.warn(`[Gardener] ⚠️ Secret ${secretName} is in Active Defaults but missing from Worker Env! Skipping.`);
      continue;
    }

    try {
      await octokit.request('PUT /repos/{owner}/{repo}/environments/{environment_name}', {
        owner,
        repo,
        environment_name: 'copilot',
      });

      const { data: pubKey } = await octokit.request(
        'GET /repos/{owner}/{repo}/environments/{environment_name}/secrets/public-key',
        { owner, repo, environment_name: 'copilot' },
      );

      await sodium.ready;
      const binKey = sodium.from_base64(pubKey.key, sodium.base64_variants.ORIGINAL);
      const binSecret = sodium.from_string(String(secretValue));
      const encBytes = sodium.crypto_box_seal(binSecret, binKey);
      const encryptedValue = sodium.to_base64(encBytes, sodium.base64_variants.ORIGINAL);

      await octokit.request(
        'PUT /repos/{owner}/{repo}/environments/{environment_name}/secrets/{secret_name}',
        {
          owner,
          repo,
          environment_name: 'copilot',
          secret_name: secretName,
          encrypted_value: encryptedValue,
          key_id: pubKey.key_id,
        },
      );

      console.log(`[Gardener] ✅ Secret ${secretName} set in copilot environment!`);
    } catch (error) {
      console.error(`[Gardener] ❌ Failed to set secret ${secretName}:`, error);
    }
  }
}
SECRETS

cat > backend/src/automations/push/orchestrator/sync_standardization_pull_request.ts <<'PRSYNC'
import { encode } from '@utils/base64';
import { RepoSpecialistBuilder } from '../repo_specialist';
import type { PushContext } from '../fixers/worker_types';

export async function syncStandardizationFilesPr(ctx: PushContext) {
  const octokit = ctx.octokit;
  const targetOwner = ctx.repo.owner;
  const targetRepo = ctx.repo.name;

  const stdOwner = (ctx.env as any).GITHUB_OWNER || 'jmbish04';
  const stdRepo = (ctx.env as any).STANDARDIZATION_REPO_NAME || 'core-github-standardization';

  if (targetOwner === stdOwner && targetRepo === stdRepo) {
    return;
  }

  console.log(`[Gardener] Checking Standardization PR Sync for ${targetOwner}/${targetRepo}...`);

  try {
    const { data: targetRepoData } = await octokit.repos.get({ owner: targetOwner, repo: targetRepo });
    const targetDefaultBranch = targetRepoData.default_branch;

    const { data: targetRefData } = await octokit.git.getRef({
      owner: targetOwner,
      repo: targetRepo,
      ref: `heads/${targetDefaultBranch}`,
    });
    const targetCommitSha = targetRefData.object.sha;

    const { data: targetCommitData } = await octokit.git.getCommit({
      owner: targetOwner,
      repo: targetRepo,
      commit_sha: targetCommitSha,
    });
    const targetTreeSha = targetCommitData.tree.sha;

    const { data: targetTreeData } = await octokit.git.getTree({
      owner: targetOwner,
      repo: targetRepo,
      tree_sha: targetTreeSha,
      recursive: 'true',
    });

    const { data: stdRepoData } = await octokit.repos.get({ owner: stdOwner, repo: stdRepo });
    const stdDefaultBranch = stdRepoData.default_branch;

    const { data: stdRefData } = await octokit.git.getRef({
      owner: stdOwner,
      repo: stdRepo,
      ref: `heads/${stdDefaultBranch}`,
    });
    const stdCommitSha = stdRefData.object.sha;

    const { data: stdTreeData } = await octokit.git.getTree({
      owner: stdOwner,
      repo: stdRepo,
      tree_sha: stdCommitSha,
      recursive: 'true',
    });

    const stdBlobs = stdTreeData.tree.filter((treeNode: any) => treeNode.type === 'blob' && treeNode.path !== 'README.md');
    const targetBlobs = new Map(
      targetTreeData.tree
        .filter((treeNode: any) => treeNode.type === 'blob')
        .map((treeNode: any) => [treeNode.path, treeNode.sha]),
    );

    const blobsToCreate: Array<{ path: string; content?: string }> = [];
    let hasMcpJson = false;

    for (const stdBlob of stdBlobs) {
      if (stdBlob.path === '.github/copilot/mcp.json') hasMcpJson = true;

      if (!targetBlobs.has(stdBlob.path) || targetBlobs.get(stdBlob.path) !== stdBlob.sha) {
        const { data: blobData } = await octokit.git.getBlob({
          owner: stdOwner,
          repo: stdRepo,
          file_sha: stdBlob.sha!,
        });

        blobsToCreate.push({
          path: stdBlob.path!,
          content: blobData.content,
        });
      }
    }

    const mcpPath = '.github/copilot/mcp.json';
    if (!hasMcpJson && !targetBlobs.has(mcpPath)) {
      console.log('[Gardener] Standardization repo missing mcp.json. Injecting fallback.');
      const mcpConfig = {
        mcpServers: {
          'cloudflare-docs': {
            type: 'stdio',
            command: 'npx',
            args: ['-y', 'mcp-remote', 'https://docs.mcp.cloudflare.com/mcp'],
            tools: ['search_cloudflare_documentation'],
          },
          stitch: {
            type: 'http',
            url: 'https://stitch.googleapis.com/mcp',
            headers: {
              Accept: 'application/json',
              'X-Goog-Api-Key': '${STITCH_API_KEY}',
            },
            tools: [
              'create_project',
              'list_projects',
              'list_screens',
              'get_project',
              'get_screen',
              'generate_screen_from_text',
            ],
          },
        },
      };
      blobsToCreate.push({
        path: mcpPath,
        content: encode(JSON.stringify(mcpConfig, null, 2)),
      });
    }

    const agentPath = '.github/agents/repo-specialist.agent.md';
    let existingAgentContent: string | null = null;
    if (targetBlobs.has(agentPath)) {
      const { data: agentBlobData } = await octokit.git.getBlob({
        owner: targetOwner,
        repo: targetRepo,
        file_sha: targetBlobs.get(agentPath)!,
      });
      existingAgentContent = typeof atob !== 'undefined'
        ? atob(agentBlobData.content)
        : Buffer.from(agentBlobData.content, 'base64').toString('utf-8');
    }

    const builder = new RepoSpecialistBuilder({} as any, ctx.env);
    const newAgentContent = await builder.generateAgentMarkdown(
      targetRepoData.name,
      targetRepoData.description,
      existingAgentContent,
    );

    if (existingAgentContent !== newAgentContent) {
      blobsToCreate.push({
        path: agentPath,
        content: encode(newAgentContent),
      });
    }

    if (blobsToCreate.length === 0) {
      console.log(`[Gardener] Target repo ${targetOwner}/${targetRepo} is fully synchronized with standardization.`);
      return;
    }

    const { data: pulls } = await octokit.pulls.list({
      owner: targetOwner,
      repo: targetRepo,
      state: 'open',
    });

    if (pulls.some((pr: any) => pr.head.ref.startsWith('chore/sync-standard-files'))) {
      console.log(`[Gardener] PR already exists for Standardization files on ${targetOwner}/${targetRepo}. Skipping.`);
      return;
    }

    console.log(`[Gardener] Creating Standardization PR with ${blobsToCreate.length} changed files...`);

    const newTreeNodes: any[] = [];
    for (const blob of blobsToCreate) {
      const { data: newBlob } = await octokit.git.createBlob({
        owner: targetOwner,
        repo: targetRepo,
        content: blob.content!,
        encoding: 'base64',
      });

      newTreeNodes.push({
        path: blob.path,
        mode: '100644',
        type: 'blob',
        sha: newBlob.sha,
      });
    }

    const { data: newTree } = await octokit.git.createTree({
      owner: targetOwner,
      repo: targetRepo,
      base_tree: targetTreeSha,
      tree: newTreeNodes,
    });

    const branchName = `chore/sync-standard-files-${Date.now()}`;
    const commitMessage = 'chore(gardener): orchestrate standardization repo files and custom agents';

    const { data: newCommit } = await octokit.git.createCommit({
      owner: targetOwner,
      repo: targetRepo,
      message: commitMessage,
      tree: newTree.sha,
      parents: [targetCommitSha],
    });

    await octokit.git.createRef({
      owner: targetOwner,
      repo: targetRepo,
      ref: `refs/heads/${branchName}`,
      sha: newCommit.sha,
    });

    const prBody = `Automated PR from the Antigravity Gardener Orchestrator.\n\nThis synchronizes the latest base configuration files from the Standardization Repository and automatically optimizes the \`repo-specialist.agent.md\` custom GitHub Copilot agent using your repository's context.\n\n**Modified/Added Files:**\n${blobsToCreate.map((blob) => `- \`${blob.path}\``).join('\n')}`;

    await octokit.pulls.create({
      owner: targetOwner,
      repo: targetRepo,
      title: 'chore: Sync Standardization Repository Files',
      head: branchName,
      base: targetDefaultBranch,
      body: prBody,
    });

    console.log(`[Gardener] Successfully opened Synchronization PR for ${targetOwner}/${targetRepo}.`);
  } catch (error) {
    console.error('[Gardener] Failed to sync standardization PR:', error);
  }
}
PRSYNC

cat > backend/src/automations/push/orchestrator/index.ts <<'ORCH'
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
ORCH

# Rewrite imports and helper paths after moves
node <<'NODE'
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const base = path.join(root, 'backend', 'src');
const replacements = [
  ['@/automations/issues/BugHunter', '@/automations/issues/bug_hunter'],
  ['@/automations/issues/JulesAutoFix', '@/automations/issues/jules_auto_fix'],
  ['@/automations/issues/SlashCommand', '@/automations/issues/slash_command'],
  ['@/automations/issues/TaskSync', '@/automations/issues/task_sync'],
  ['./bug-hunter-workflow', './bug_hunter/workflow'],
  ['@/automations/pr/AgentTagger', '@/automations/pr/agent_tagger'],
  ['@/automations/pr/BuildAnalyzer', '@/automations/pr/build_analyzer'],
  ['@/automations/pr/DocstringGenerator', '@/automations/pr/docstring_generator'],
  ['@/automations/pr/GeminiReview', '@/automations/pr/gemini_review'],
  ['@/automations/pr/PRIngest', '@/automations/pr/ingest'],
  ['@/automations/pr/PRReviewExtraction', '@/automations/pr/review_extraction'],
  ['./agent-tagging', './agent_tagger/tagging'],
  ['./build-analysis', './build_analyzer/analysis'],
  ['./docstrings', './docstring_generator/service'],
  ['@/automations/push/GardenerPush', '@/automations/push/gardener'],
  ['@/automations/push/JulesStandardsPush', '@/automations/push/jules_standards'],
  ['@/automations/push/router', '@/automations/push/command_router'],
  ['./router', './command_router'],
  ['./specialist', './repo_specialist'],
  ['../specialist', '../repo_specialist'],
  ['../fixers/all', '../fixers/fix_all'],
  ['../fixers/types', '../fixers/worker_types'],
  ['./fixers/types', './fixers/worker_types'],
  ['./fixers/all', './fixers/fix_all'],
  ['@/automations/repository/RepoStandardization', '@/automations/repository/standardize'],
  ['@/automations/repository/RepoSync', '@/automations/repository/sync'],
  ['@/automations/repository/StatsUpdate', '@/automations/repository/stats_update'],
  ['@/automations/security/LeakPlumber', '@/automations/security/leak_plumber'],
  ['./leak-plumber-workflow', './leak_plumber/workflow'],
  ['@/automations/telemetry/TelemetryIngestion', '@/automations/telemetry/ingest'],
  ['@/automations/shared/statusMapper', '@/automations/shared/status_mapper'],
];

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
    } else if (entry.isFile() && /\.(ts|tsx|mts|cts)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

for (const file of walk(base)) {
  let text = fs.readFileSync(file, 'utf8');
  let changed = false;
  for (const [from, to] of replacements) {
    if (text.includes(from)) {
      text = text.split(from).join(to);
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(file, text);
  }
}
NODE

# Stage only the reorg changes
git add \
  .agent/scripts/reorg_automations.sh \
  backend/src/automations \
  backend/src/core/AutomationRegistry.ts \
  backend/src/ai/agents/automations/push/implementer.ts \
  backend/src/routes/api/ops/standards.ts

git status --short
