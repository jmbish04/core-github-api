import autoApplyGeminiWorkflow from './.github/workflows/auto-apply-gemini.yaml';
import agentDocstringsWorkflow from './.github/workflows/agent-docstrings.yaml';
import automationMaintainerWorkflow from './.github/workflows/automation-maintainer.yaml';
import deployWorkerWorkflow from './.github/workflows/deploy-worker.yaml';
import prCommentExtractorWorkflow from './.github/workflows/pr-comment-extractor.yaml';
import { buildCopilotMcpJson, buildRootMcpJson } from './mcp-servers';
import { loadStandardizationScaffoldBundle } from './standardization-assets';
import { buildRepositorySpecialistAssets } from '@/automations/repository/standardization/specialist';

export interface SyncManifestFile {
  path: string;
  content: string;
}

export interface SyncManifest {
  files: SyncManifestFile[];
}

export interface SyncRepositoryTarget {
  owner: string;
  name: string;
  defaultBranch: string;
  description?: string | null;
}

function includesCloudflareWorker(files: string[]): boolean {
  return files.some(
    (file) =>
      file.endsWith('wrangler.toml') ||
      file.endsWith('wrangler.json') ||
      file.endsWith('wrangler.jsonc'),
  );
}

async function listRepositoryFiles(octokit: any, target: SyncRepositoryTarget): Promise<string[]> {
  try {
    const { data } = await octokit.rest.git.getTree({
      owner: target.owner,
      repo: target.name,
      tree_sha: target.defaultBranch,
      recursive: 'true',
    });

    return data.tree
      .map((entry: { path?: string | null }) => entry.path || '')
      .filter(Boolean);
  } catch (error) {
    console.warn('[GardenerSync] Failed to list repository files while building manifest.', error);
    return [];
  }
}

export async function buildSyncManifest(
  env: Env,
  octokit: any,
  target: SyncRepositoryTarget,
): Promise<SyncManifest> {
  const repoFiles = await listRepositoryFiles(octokit, target);
  const includeDeployWorkflow = includesCloudflareWorker(repoFiles);
  const scaffoldBundle = await loadStandardizationScaffoldBundle(env, octokit);
  const tailoredAssets = await buildRepositorySpecialistAssets(
    env,
    target.name,
    target.description || null,
    {
      agentsGuideTemplate: scaffoldBundle.agentsGuideSeed,
    },
  );

  const files: SyncManifestFile[] = [
    {
      path: 'mcp.json',
      content: buildRootMcpJson(),
    },
    {
      path: '.github/copilot/mcp.json',
      content: buildCopilotMcpJson(),
    },
    {
      path: '.github/workflows/auto-apply-gemini.yaml',
      content: autoApplyGeminiWorkflow,
    },
    {
      path: '.github/workflows/agent-docstrings.yaml',
      content: agentDocstringsWorkflow,
    },
    {
      path: '.github/workflows/automation-maintainer.yaml',
      content: automationMaintainerWorkflow,
    },
    {
      path: '.github/workflows/pr-comment-extractor.yaml',
      content: prCommentExtractorWorkflow,
    },
    {
      path: '.github/agents/repo-specialist.agent.md',
      content: tailoredAssets.repoSpecialistMarkdown,
    },
    {
      path: 'AGENTS.md',
      content: tailoredAssets.agentsGuideMarkdown,
    },
    ...scaffoldBundle.lowTouchAssets,
  ];

  if (includeDeployWorkflow) {
    files.push({
      path: '.github/workflows/deploy-worker.yaml',
      content: deployWorkerWorkflow,
    });
  }

  return { files };
}

export async function applySyncManifestToBranch(
  octokit: any,
  target: SyncRepositoryTarget,
  branch: string,
  manifest: SyncManifest,
): Promise<string[]> {
  const changedPaths: string[] = [];

  for (const file of manifest.files) {
    let existingSha: string | undefined;
    let existingContent = '';

    try {
      const { data } = await octokit.rest.repos.getContent({
        owner: target.owner,
        repo: target.name,
        path: file.path,
        ref: branch,
      });

      if (!Array.isArray(data) && data.type === 'file' && data.content) {
        existingSha = data.sha;
        existingContent = atob(data.content);
      }
    } catch (error: any) {
      if (error.status !== 404) {
        throw error;
      }
    }

    if (existingContent === file.content) {
      continue;
    }

    await octokit.rest.repos.createOrUpdateFileContents({
      owner: target.owner,
      repo: target.name,
      path: file.path,
      message: `chore(sync): update ${file.path}`,
      content: btoa(file.content),
      sha: existingSha,
      branch,
    });

    changedPaths.push(file.path);
  }

  return changedPaths;
}
