import { Octokit } from "@octokit/rest";
import { getGithubToken } from "@/utils/secrets";
import { Buffer } from "node:buffer";

export type CreatePullRequestParams = {
  owner: string;
  repo: string;
  branchName: string;
  filePath: string;
  newContent: string;
  commitMessage: string;
  prTitle: string;
  prBody: string;
  baseBranch?: string;
};

export async function searchCode(env: Env, query: string, repoContext?: any): Promise<any> {
  const ghToken = await getGithubToken(env);
  const octokit = new Octokit({ auth: ghToken });
  let finalQuery = query;
  if (repoContext?.owner && repoContext?.repo) {
    finalQuery += ` repo:${repoContext.owner}/${repoContext.repo}`;
  }
  const result = await octokit.search.code({ q: finalQuery });
  return result.data;
}

export async function getFileContent(env: Env, owner: string, repo: string, path: string, ref?: string): Promise<string> {
  const ghToken = await getGithubToken(env);
  const octokit = new Octokit({ auth: ghToken });
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path, ref });
    if ("content" in data && typeof data.content === "string") {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }
    return "File is not a standard text file or is a directory.";
  } catch (error: any) {
    throw new Error(`Failed to fetch file: ${error.message}`);
  }
}

export async function createPullRequest(env: Env, params: CreatePullRequestParams): Promise<string> {
  const ghToken = await getGithubToken(env);
  const octokit = new Octokit({ auth: ghToken });
  
  const { owner, repo, branchName, filePath, newContent, commitMessage, prTitle, prBody, baseBranch } = params;

  let actualBase = baseBranch;
  if (!actualBase) {
    const { data: repoData } = await octokit.repos.get({ owner, repo });
    actualBase = repoData.default_branch;
  }

  const { data: refData } = await octokit.git.getRef({ owner, repo, ref: `heads/${actualBase}` });
  await octokit.git.createRef({ owner, repo, ref: `refs/heads/${branchName}`, sha: refData.object.sha });

  let fileSha: string | undefined;
  try {
    const { data: fileData } = await octokit.repos.getContent({ owner, repo, path: filePath, ref: branchName });
    if (!Array.isArray(fileData) && (fileData as any).type === "file") fileSha = (fileData as any).sha;
  } catch { /* new file */ }

  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message: commitMessage,
    content: Buffer.from(newContent).toString("base64"),
    branch: branchName,
    sha: fileSha,
  });

  const { data: prData } = await octokit.pulls.create({
    owner,
    repo,
    title: prTitle,
    body: prBody,
    head: branchName,
    base: actualBase,
  });

  return prData.html_url;
}

export async function checkDuplicatePR(env: Env, owner: string, repo: string, title?: string): Promise<any[]> {
  const ghToken = await getGithubToken(env);
  const octokit = new Octokit({ auth: ghToken });
  const { data: prs } = await octokit.pulls.list({ owner, repo, state: "open" });
  if (title) {
     return prs.filter((pr) => pr.title.includes(title) || title.includes(pr.title)).map(pr => ({ title: pr.title, url: pr.html_url }));
  }
  return prs.map((pr) => ({ title: pr.title, url: pr.html_url }));
}
