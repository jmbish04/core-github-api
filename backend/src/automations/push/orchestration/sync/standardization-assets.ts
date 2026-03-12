import rootAgentsGuide from '../../../../../../AGENTS.md';
import architectureRule from '../../../../../../.agent/rules/architecture.md';
import cloudflareStackRule from '../../../../../../.agent/rules/cloudflare-stack.md';
import coreDirectiveRule from '../../../../../../.agent/rules/000-core-directive.md';
import fullCodeOutputRule from '../../../../../../.agent/rules/full-code-output.md';
import implementFeatureWorkflow from '../../../../../../.agent/workflows/implement-feature.md';
import createSpecialistSkill from '../../../../../../.agent/skills/create_specialist_agent/SKILL.md';
import honiAgentsSkill from '../../../../../../.agent/skills/honi-agents/SKILL.md';

export interface StandardizationScaffoldAsset {
  path: string;
  content: string;
}

export interface StandardizationScaffoldBundle {
  agentsGuideSeed: string;
  lowTouchAssets: StandardizationScaffoldAsset[];
}

interface RemoteAssetSource {
  sourcePath: string;
  targetPath: string;
}

const FALLBACK_LOW_TOUCH_ASSETS: StandardizationScaffoldAsset[] = [
  {
    path: '.agent/rules/000-core-directive.md',
    content: coreDirectiveRule,
  },
  {
    path: '.agent/rules/architecture.md',
    content: architectureRule,
  },
  {
    path: '.agent/rules/cloudflare-stack.md',
    content: cloudflareStackRule,
  },
  {
    path: '.agent/rules/full-code-output.md',
    content: fullCodeOutputRule,
  },
  {
    path: '.agent/workflows/implement-feature.md',
    content: implementFeatureWorkflow,
  },
  {
    path: '.agent/SKILLS/create_specialist_agent/SKILL.md',
    content: createSpecialistSkill,
  },
  {
    path: '.agent/SKILLS/honi-agents/SKILL.md',
    content: honiAgentsSkill,
  },
];

const REMOTE_ASSET_SOURCES: RemoteAssetSource[] = [
  {
    sourcePath: '.agent/rules',
    targetPath: '.agent/rules',
  },
  {
    sourcePath: '.agent/workflows',
    targetPath: '.agent/workflows',
  },
  {
    sourcePath: '.agent/SKILLS',
    targetPath: '.agent/SKILLS',
  },
  {
    sourcePath: '.agent/skills',
    targetPath: '.agent/SKILLS',
  },
];

function getStandardizationRepo(env: Env): { owner: string; repo: string } {
  return {
    owner: env.GITHUB_OWNER || 'jmbish04',
    repo: env.STANDARDIZATION_REPO_NAME || 'core-github-standardization',
  };
}

function toTargetPath(sourcePath: string, sourcePrefix: string, targetPrefix: string): string {
  const suffix = sourcePath.startsWith(sourcePrefix)
    ? sourcePath.slice(sourcePrefix.length)
    : sourcePath;
  return `${targetPrefix}${suffix}`;
}

async function fetchTextFile(
  octokit: any,
  owner: string,
  repo: string,
  path: string,
): Promise<string | null> {
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path });
    if (!Array.isArray(data) && data.type === 'file' && data.content) {
      return atob(data.content);
    }
  } catch (error: any) {
    if (error.status !== 404) {
      console.warn(`[GardenerSync] Failed to fetch standardization asset ${path}.`, error);
    }
  }

  return null;
}

async function fetchDirectoryAssets(
  octokit: any,
  owner: string,
  repo: string,
  sourcePrefix: string,
  targetPrefix: string,
): Promise<StandardizationScaffoldAsset[]> {
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path: sourcePrefix });
    if (!Array.isArray(data)) {
      return [];
    }

    const assets: StandardizationScaffoldAsset[] = [];
    for (const item of data) {
      if (item.type === 'dir') {
        const nestedAssets = await fetchDirectoryAssets(
          octokit,
          owner,
          repo,
          item.path,
          toTargetPath(item.path, sourcePrefix, targetPrefix),
        );
        assets.push(...nestedAssets);
        continue;
      }

      if (item.type !== 'file') {
        continue;
      }

      const content = await fetchTextFile(octokit, owner, repo, item.path);
      if (!content) {
        continue;
      }

      assets.push({
        path: toTargetPath(item.path, sourcePrefix, targetPrefix),
        content,
      });
    }

    return assets;
  } catch (error: any) {
    if (error.status !== 404) {
      console.warn(`[GardenerSync] Failed to fetch standardization asset directory ${sourcePrefix}.`, error);
    }
    return [];
  }
}

export async function loadStandardizationScaffoldBundle(
  env: Env,
  octokit: any,
): Promise<StandardizationScaffoldBundle> {
  const repoRef = getStandardizationRepo(env);
  const agentsGuideSeed =
    (await fetchTextFile(octokit, repoRef.owner, repoRef.repo, 'AGENTS.md')) || rootAgentsGuide;

  const remoteAssets = await Promise.all(
    REMOTE_ASSET_SOURCES.map((source) =>
      fetchDirectoryAssets(octokit, repoRef.owner, repoRef.repo, source.sourcePath, source.targetPath),
    ),
  );

  const merged = new Map<string, StandardizationScaffoldAsset>();
  for (const asset of FALLBACK_LOW_TOUCH_ASSETS) {
    merged.set(asset.path, asset);
  }
  for (const asset of remoteAssets.flat()) {
    merged.set(asset.path, asset);
  }

  return {
    agentsGuideSeed,
    lowTouchAssets: Array.from(merged.values()).sort((a, b) => a.path.localeCompare(b.path)),
  };
}
