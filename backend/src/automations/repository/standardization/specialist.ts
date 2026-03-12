import repoSpecialistTemplate from '@/automations/push/orchestration/sync/.github/agents/repo-specialist.agent.md';
import { RepoSpecialistBuilder } from '@/ai/services/repository-specialist-builder';

function createRepoSpecialistBuilder(env: Env): RepoSpecialistBuilder {
  return new RepoSpecialistBuilder(env);
}

export interface RepositorySpecialistAssets {
  repoSpecialistMarkdown: string;
  agentsGuideMarkdown: string;
}

export async function buildRepositorySpecialistAssets(
  env: Env,
  repo: string,
  description: string | null,
  seeds?: {
    repoSpecialistTemplate?: string | null;
    agentsGuideTemplate?: string | null;
  },
): Promise<RepositorySpecialistAssets> {
  const repoSpecialistMarkdown = await createRepoSpecialistBuilder(env).generateAgentMarkdown(
    repo,
    description,
    seeds?.repoSpecialistTemplate || repoSpecialistTemplate,
  );

  const seedGuide = String(seeds?.agentsGuideTemplate || '').trim();
  const agentsGuideMarkdown = [
    `# ${repo} Agent Operating Guide`,
    '',
    description
      ? `Repository summary: ${description}`
      : `Repository summary: Cloudflare-focused engineering repository for ${repo}.`,
    '',
    '## Repo-Specific Priorities',
    '- Preserve Cloudflare Worker compatibility and deployment safety.',
    '- Keep webhook automations modular, typed, and reviewable.',
    '- Prefer focused pull requests over broad rewrites.',
    '- Keep generated repo sync assets in sync with the standardization source of truth.',
    '- Enforce full-code output only. See `.agent/rules/full-code-output.md`.',
    '',
    seedGuide || '# AGENTS.md',
  ].join('\n');

  return {
    repoSpecialistMarkdown,
    agentsGuideMarkdown,
  };
}

export async function ensureRepositorySpecialist(
  env: Env,
  owner: string,
  repo: string,
  octokit: any,
): Promise<void> {
  let existingPath = '.github/agents/repo-specialist.agent.md';
  let existingSha: string | undefined;
  let existingContent: string | null = null;

  try {
    const { data: contents } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: '.github/agents',
    });

    if (Array.isArray(contents)) {
      const existingAgent = contents.find((entry) => entry.name.endsWith('.agent.md'));
      if (existingAgent) {
        existingPath = existingAgent.path;
      }
    }
  } catch (error: any) {
    if (error.status !== 404) {
      throw error;
    }
  }

  try {
    const { data: existingFile } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: existingPath,
    });

    if (!Array.isArray(existingFile) && existingFile.type === 'file' && existingFile.content) {
      existingSha = existingFile.sha;
      existingContent = atob(existingFile.content);
    }
  } catch (error: any) {
    if (error.status !== 404) {
      throw error;
    }
  }

  let description: string | null = null;
  try {
    const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
    description = repoData.description || null;
  } catch {
    description = null;
  }

  let existingAgentsGuideSha: string | undefined;
  let existingAgentsGuideContent: string | null = null;

  try {
    const { data: existingGuide } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: 'AGENTS.md',
    });

    if (!Array.isArray(existingGuide) && existingGuide.type === 'file' && existingGuide.content) {
      existingAgentsGuideSha = existingGuide.sha;
      existingAgentsGuideContent = atob(existingGuide.content);
    }
  } catch (error: any) {
    if (error.status !== 404) {
      throw error;
    }
  }

  const assets = await buildRepositorySpecialistAssets(env, repo, description, {
    repoSpecialistTemplate: existingContent || repoSpecialistTemplate,
    agentsGuideTemplate: existingAgentsGuideContent,
  });

  if (existingContent !== assets.repoSpecialistMarkdown) {
    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: existingPath,
      message: existingSha
        ? 'chore(agent): refresh repository specialist profile'
        : 'feat(agent): add repository specialist profile',
      content: btoa(assets.repoSpecialistMarkdown),
      sha: existingSha,
    });
  }

  if (existingAgentsGuideContent !== assets.agentsGuideMarkdown) {
    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: 'AGENTS.md',
      message: existingAgentsGuideSha
        ? 'chore(agent): refresh AGENTS guide'
        : 'feat(agent): add AGENTS guide',
      content: btoa(assets.agentsGuideMarkdown),
      sha: existingAgentsGuideSha,
    });
  }
}
