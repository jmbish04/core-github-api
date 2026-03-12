import type { Octokit } from '@octokit/rest';
import { generateText } from '@/ai/providers';
import { withFullCodeOutputRules } from '@/ai/utils/code-output-rules';
import { generateUuid } from '@/utils/common';
import { getOctokit } from '@/services/octokit/core';

export interface DocstringResult {
  filePath: string;
  originalContent: string;
  updatedContent: string;
}

async function fetchFile(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
): Promise<string | null> {
  try {
    const response = await octokit.rest.repos.getContent({ owner, repo, path });
    const data = response.data as { type?: string; content?: string };
    if (data.type === 'file' && data.content) {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
  } catch {
    // Ignore missing or binary files.
  }

  return null;
}

async function generateDocstrings(path: string, content: string, env: Env): Promise<string> {
  const systemPrompt = withFullCodeOutputRules(`You are a senior technical writer and software engineer.
Your task is to add high-quality TSDoc/JSDoc/Docstrings to the provided code.
Focus on:
1. Exported functions, classes, and interfaces.
2. Parameters, return values, and exceptions.
3. Complex logic that needs explanation.
4. Keeping existing code EXACTLY as is, only adding docstrings above the declarations.
Return the ENTIRE file content with the docstrings added.`);

  return generateText(
    env,
    `File: ${path}\n\nCode:\n${content}`,
    systemPrompt,
    {
      model: '@cf/openai/gpt-oss-120b',
      temperature: 0.1,
    },
    'worker-ai',
  );
}

export async function generateDocstringsForProject(
  env: Env,
  owner: string,
  repo: string,
  files: string[],
  octokit?: Octokit,
): Promise<{ prUrl: string; branchName: string }> {
  const github = octokit || (await getOctokit(env));
  const results: DocstringResult[] = [];

  for (const path of files.slice(0, 5)) {
    const content = await fetchFile(github, owner, repo, path);
    if (!content) {
      continue;
    }

    const updatedContent = await generateDocstrings(path, content, env);
    if (updatedContent && updatedContent !== content) {
      results.push({
        filePath: path,
        originalContent: content,
        updatedContent,
      });
    }
  }

  if (!results.length) {
    throw new Error('No docstring improvements generated.');
  }

  const branchName = `ai-docstrings-${generateUuid().slice(0, 8)}`;
  const repoResponse = await github.rest.repos.get({ owner, repo });
  const defaultBranch = repoResponse.data.default_branch;

  const ref = await github.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${defaultBranch}`,
  });

  await github.rest.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha: ref.data.object.sha,
  });

  for (const result of results) {
    await github.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: result.filePath,
      message: `docs: generate docstrings for ${result.filePath}`,
      content: Buffer.from(result.updatedContent).toString('base64'),
      branch: branchName,
    });
  }

  const pullRequest = await github.rest.pulls.create({
    owner,
    repo,
    title: 'docs: AI-generated docstrings',
    head: branchName,
    base: defaultBranch,
    body: 'This PR adds AI-generated docstrings to improve code documentation and clarity.',
  });

  return {
    prUrl: pullRequest.data.html_url,
    branchName,
  };
}
