import { getOctokit } from '@services/octokit/core';
import { buildCopilotMcpPayload } from '@/automations/push/orchestration/sync/mcp-servers';

export async function configureRepoMcpTools(env: Env, owner: string, repo: string) {
  const octokit = await getOctokit(env);
  const payload = buildCopilotMcpPayload();

  const response = await octokit.request('PATCH /repos/{owner}/{repo}/copilot/coding_agent', {
    owner,
    repo,
    ...payload,
  });

  return response.data;
}
