import { ensureProjectForRepository, upsertRepositoryFromGitHub } from '@/services/repository-sync';
import { getOctokit } from '@/services/octokit/core';

export async function getOrCreateProjectForRepository(
  env: Env,
  input: {
    owner: string;
    repo: string;
    repoUrl?: string;
    projectId?: string;
    description?: string | null;
  },
): Promise<{ projectId: string | null; repoId: string }> {
  if (input.projectId) {
    const repoId = `github:${input.owner}/${input.repo}`;
    return { projectId: input.projectId, repoId };
  }

  const octokit = await getOctokit(env);
  const { data } = await octokit.repos.get({
    owner: input.owner,
    repo: input.repo,
  });

  const { repoId } = await upsertRepositoryFromGitHub(env, data, {
    ownerOverride: input.owner,
  });

  const project = await ensureProjectForRepository(env, repoId, {
    name: data.name,
    description: data.description || input.description || null,
    owner: input.owner,
    status: 'planning',
  });

  return { projectId: project.projectId, repoId };
}
