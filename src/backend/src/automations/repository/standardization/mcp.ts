import { buildCopilotMcpJson, buildRootMcpJson } from '@/automations/push/orchestration/sync/mcp-servers';

async function upsertFile(
  octokit: any,
  owner: string,
  repo: string,
  path: string,
  content: string,
): Promise<void> {
  let existingSha: string | undefined;
  let existingContent = '';

  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path });
    if (!Array.isArray(data) && data.type === 'file' && data.content) {
      existingSha = data.sha;
      existingContent = atob(data.content);
    }
  } catch (error: any) {
    if (error.status !== 404) {
      throw error;
    }
  }

  if (existingContent === content) {
    return;
  }

  await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message: `chore(standardization): sync ${path}`,
    content: btoa(content),
    sha: existingSha,
  });
}

export class McpSync {
  static async syncMcpConfig(_env: Env, targetOwner: string, targetRepo: string, octokit: any) {
    await upsertFile(octokit, targetOwner, targetRepo, 'mcp.json', buildRootMcpJson());
    await upsertFile(
      octokit,
      targetOwner,
      targetRepo,
      '.github/copilot/mcp.json',
      buildCopilotMcpJson(),
    );
  }
}
