/**
 * @file src/tools/github.ts
 * @description Tools for GitHub repository management and code search.
 * @owner AI-Builder
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { getOctokit } from '@services/octokit/core'
import { makeWorkflowTemplates } from '@/services/github/workflow-templates'
import { encodeBase64 as encode } from '@utils/base64'
import { getDb } from '@db'
import { repositories } from '@db/schemas/github/repos';
import { DEFAULT_GITHUB_OWNER } from "@github-utils";
import { Logger } from "@logging";
import { tool } from "@/ai/providers";
import { INFRA_TYPES, fetchTemplateFiles } from './templates';
import { getSecret } from "@/utils/secrets";

// --- 1. Zod Schema Definitions ---

const CreateRepoSchema = z.object({
  owner: z.string().default(DEFAULT_GITHUB_OWNER).describe('Organization or user owner'),
  name: z.string().describe('Repository name'),
  description: z.string().optional().describe('Repository description'),
  infrastructure: z.enum(INFRA_TYPES).describe('Infrastructure type'),
  private: z.boolean().optional().default(false),
  auto_init: z.boolean().optional().default(true),
})

const RetrofitSchema = z.object({
  owner: z.string().default(DEFAULT_GITHUB_OWNER),
  repos: z.array(z.string()).optional(),
  force: z.boolean().optional().default(false),
})

const SearchCodeSchema = z.object({
  owner: z.string().default(DEFAULT_GITHUB_OWNER),
  repo: z.string(),
  query: z.string(),
})

const FetchFileSchema = z.object({
  owner: z.string().default(DEFAULT_GITHUB_OWNER),
  repo: z.string(),
  path: z.string(),
  ref: z.string().optional(),
})

// --- 2. Internal Helpers ---

async function upsertWorkflowFile(env: Env, octokit: any, owner: string, repo: string, path: string, content: string, force: boolean) {
  const logger = new Logger(env, "GitHubTool:UpsertWorkflowFile");
  try {
    let sha: string | undefined;
    try {
      const { data } = await octokit.repos.getContent({ owner, repo, path });
      if ('sha' in data) sha = (data as any).sha;
    } catch (e: any) {
      const errorMessage = `[GitHubTool:UpsertWorkflowFile] Failed to get file ${path}; ${JSON.stringify(e)}`;
      logger.error(errorMessage);
      if (e.status !== 404) throw e;
    }

    if (sha && !force) {
      const logMessage = `[GitHubTool:UpsertWorkflowFile] File ${path} exists, skipping`;
      logger.info(logMessage);
      return { status: 'skipped', message: 'File exists' };
    }

    await octokit.repos.createOrUpdateFileContents({
      owner, repo, path,
      message: sha ? `chore: update ${path}` : `chore: add ${path}`,
      content: encode(content),
      sha,
    });
    return { status: 'success', message: sha ? 'Updated' : 'Created' };
  } catch (e: any) {
    const errorMessage = `[GitHubTool:UpsertWorkflowFile] Failed to upsert file ${path}; ${JSON.stringify(e)}`;
    logger.error(errorMessage);
    return { status: 'failure', message: e.message || 'Unknown error' };
  }
}

async function getToken(env: Env): Promise<string> {
  const logger = new Logger(env, "GitHubTool:GetToken");
  const token = getSecret(env, "GITHUB_PERSONAL_ACCESS_TOKEN");
  if (!token) {
    const errorMessage = "[GitHubTool:GetToken] Missing GITHUB_PERSONAL_ACCESS_TOKEN in environment";
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }
  return token as any;
}

export async function verifyGitHubToken(env: Env): Promise<{ valid: boolean; user?: string; error?: string }> {
  try {
    const token = await getToken(env);
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Cloudflare-Worker-MCP",
      },
    });
    if (!response.ok) {
      return { valid: false, error: `GitHub API returned ${response.status}` };
    }
    const data = await response.json() as any;
    return { valid: true, user: data.login };
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
}

// --- 3. Core Implementation ---

export async function createRepo(env: Env, params: z.infer<typeof CreateRepoSchema>) {
  const { owner, name, description, infrastructure, private: isPrivate, auto_init } = params;
  const logger = new Logger(env, "GitHubTool:CreateRepo");
  const octokit = await getOctokit(env);
  const db = getDb(env.DB);

  try {

    const { data: repo } = await octokit.repos.createInOrg({
      org: owner,
      name,
      description,
      private: isPrivate,
      auto_init
    });

    await new Promise(r => setTimeout(r, 2000));

    const files = await fetchTemplateFiles(env, infrastructure, name);
    for (const [path, content] of Object.entries(files)) {
      await upsertWorkflowFile(env, octokit, owner, name, path, content as string, false);
    }

    const workflowTemplates = makeWorkflowTemplates(env.GITHUB_REPO_STANDARDIZATION);
    for (const wf of workflowTemplates) {
      await upsertWorkflowFile(env, octokit, owner, name, wf.path, wf.content, false);
    }

    await db.insert(repositories).values({
      id: `github:${owner}/${name}`,
      provider: 'github',
      owner,
      name,
      slug: `github:${owner}/${name}`,
      repoUrl: repo.html_url,
      description,
      visibility: isPrivate ? 'private' : 'public',
      infrastructure,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }).onConflictDoUpdate({
      target: repositories.id,
      set: { infrastructure, updatedAt: new Date().toISOString() }
    });

    return { html_url: repo.html_url };
  } catch (error) {
    const errorMessage = `[GitHubTool:CreateRepo] Failed to create repository; ${JSON.stringify(error)}`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }
}

export async function retrofitWorkflows(env: Env, params: z.infer<typeof RetrofitSchema>) {
  const { owner, repos, force } = params;
  const logger = new Logger(env, "GitHubTool:Retrofit");
  const octokit = await getOctokit(env);

  let targetRepos: any[] = [];
  if (repos && repos.length > 0) {
    for (const r of repos) {
      try {
        const { data } = await octokit.repos.get({ owner, repo: r });
        targetRepos.push(data);
      } catch (error) {
        const errorMessage = `[GitHubTool:Retrofit] Failed to get repository ${r}; ${JSON.stringify(error)}`;
        logger.error(errorMessage);
        throw new Error(errorMessage);
      }
    }
  } else {
    const { data } = await octokit.repos.listForOrg({ org: owner, type: 'all', per_page: 100 });
    targetRepos = data;
  }

  let success = 0, failed = 0;
  const workflowTemplates = makeWorkflowTemplates(env.GITHUB_REPO_STANDARDIZATION);

  for (const repo of targetRepos) {
    try {
      for (const wf of workflowTemplates) {
        await upsertWorkflowFile(env, octokit, owner, repo.name, wf.path, wf.content, force);
      }
      success++;
    } catch (e: any) {
      const errorMessage = `[GitHubTool:Retrofit] Failed to retrofit workflows for repository ${repo.name}; ${JSON.stringify(e)}`;
      logger.error(errorMessage);
      failed++;
    }
  }

  return { summary: { total: targetRepos.length, success, failed } };
}

export async function getDefaultBranch(env: Env, owner: string, repo: string): Promise<string> {
  const token = await getToken(env);
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Cloudflare-Worker-MCP",
    },
  });
  if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);
  const data = await response.json() as any;
  return data.default_branch;
}

export async function fetchGitHubFile(env: Env, params: z.infer<typeof FetchFileSchema>) {
  const { owner, repo, path, ref } = params;

  try {
    const token = await getToken(env);
    const branch = ref || await getDefaultBranch(env, owner, repo);
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Cloudflare-Worker-MCP",
      },
    });

    if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);
    const data = await response.json() as any;
    if (data.encoding === "base64") {
      return atob(data.content.replace(/\n/g, ""));
    }
    return data.content || "";
  } catch (error) {
    const errorMessage = `[GitHubTool:FetchFile] Failed to fetch file ${path} in ${owner}/${repo}; ${JSON.stringify(error)}`;
    throw new Error(errorMessage);
  }
}

export async function searchRepoCode(env: Env, params: z.infer<typeof SearchCodeSchema>) {
  const { owner, repo, query } = params;

  try {
    const token = await getToken(env);
    const response = await fetch(`https://api.github.com/search/code?q=${encodeURIComponent(query)}+repo:${owner}/${repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Cloudflare-Worker-MCP",
      },
    });
    if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);
    return await response.json();
  } catch (error) {
    const errorMessage = `[GitHubTool:SearchCode] Failed to search code in ${owner}/${repo}; ${JSON.stringify(error)}`;
    throw new Error(errorMessage);
  }
}

export async function getRepoStructure(env: Env, owner: string, repo: string, path: string = "", ref?: string) {
  try {
    const token = await getToken(env);
    const branch = ref || await getDefaultBranch(env, owner, repo);
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Cloudflare-Worker-MCP",
      },
    });
    if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);
    return await response.json();
  } catch (error) {
    const errorMessage = `[GitHubTool:GetRepoStructure] Failed to get repository structure in ${owner}/${repo}; ${JSON.stringify(error)}`;
    throw new Error(errorMessage);
  }
}

// --- 4. Tool Factory ---

export async function createGitHubIssue(env: Env, params: { owner: string; repo: string; title: string; body: string }) {
  const octokit = await getOctokit(env);
  const { data } = await octokit.issues.create({ ...params });
  return data;
}

export async function updateGitHubIssue(env: Env, params: { owner: string; repo: string; issue_number: number; state?: 'open' | 'closed'; body?: string }) {
  const octokit = await getOctokit(env);
  const { data } = await octokit.issues.update({ ...params });
  return data;
}

export async function createGitHubComment(env: Env, params: { owner: string; repo: string; issue_number: number; body: string }) {
  const octokit = await getOctokit(env);
  const { data } = await octokit.issues.createComment({ ...params });
  return data;
}

export async function getRef(env: Env, params: { owner: string; repo: string; ref: string }) {
  const octokit = await getOctokit(env);
  const { data } = await octokit.git.getRef({ ...params });
  return data;
}

export async function createBranch(env: Env, params: { owner: string; repo: string; branch: string; sha: string }) {
  const octokit = await getOctokit(env);
  const { data } = await octokit.git.createRef({ 
    owner: params.owner, 
    repo: params.repo, 
    ref: `refs/heads/${params.branch}`, 
    sha: params.sha 
  });
  return data;
}

export async function createOrUpdateFile(env: Env, params: { owner: string; repo: string; path: string; message: string; content: string; branch?: string; sha?: string }) {
  const octokit = await getOctokit(env);
  const { data } = await octokit.repos.createOrUpdateFileContents({ ...params, content: encode(params.content) });
  return data;
}

export function makeGithubTools(env: Env) {
  return {
    createRepo: tool({
      description: 'Create a new GitHub repository with standard boilerplate.',
      parameters: CreateRepoSchema,
      execute: async (params: any) => createRepo(env, params),
    } as any),
    retrofitWorkflows: tool({
      description: 'Add default workflows to existing repositories.',
      parameters: RetrofitSchema,
      execute: async (params: any) => retrofitWorkflows(env, params),
    } as any),
    fetchGitHubFile: tool({
      description: 'Fetch file content from GitHub.',
      parameters: FetchFileSchema,
      execute: async (params: any) => {
        const content = await fetchGitHubFile(env, params);
        return { content };
      },
    } as any),
    searchRepoCode: tool({
      description: 'Search code within a specific repository.',
      parameters: SearchCodeSchema,
      execute: async (params: any) => searchRepoCode(env, params),
    } as any),
  };
}

// --- 5. Hono App and Routes ---

const app = new OpenAPIHono<{ Bindings: Env }>()

app.openapi(
  createRoute({
    method: 'post',
    path: '/github/repos/create',
    operationId: 'toolCreateRepo',
    request: { body: { content: { 'application/json': { schema: CreateRepoSchema } } } },
    responses: {
      200: { content: { 'application/json': { schema: z.object({ html_url: z.string() }) } }, description: 'Success' }
    },
    'x-agent': true,
    description: 'Create GitHub repo',
  }),
  async (c) => c.json(await createRepo(c.env, c.req.valid('json')))
)

app.openapi(
  createRoute({
    method: 'post',
    path: '/github/repos/retrofit',
    operationId: 'toolRetrofitWorkflows',
    request: { body: { content: { 'application/json': { schema: RetrofitSchema } } } },
    responses: {
      200: { content: { 'application/json': { schema: z.object({ summary: z.any() }) } }, description: 'Success' }
    },
    'x-agent': true,
    description: 'Retrofit workflows',
  }),
  async (c) => c.json(await retrofitWorkflows(c.env, c.req.valid('json')))
)

export default app
