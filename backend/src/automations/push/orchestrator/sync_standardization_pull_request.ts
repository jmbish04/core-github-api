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
