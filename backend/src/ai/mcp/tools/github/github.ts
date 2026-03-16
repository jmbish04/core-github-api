/**
 * @file src/tools/github.ts
 * @description Tools for GitHub repository management (creation, workflow retrofitting). Full unit testing should be running in health cron checks on the worker making operational api calls in `${env.GITHUB_OWNER}/${env.HEALTH_TEST_REPO_NAME}`.
 * @owner AI-Builder
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { getOctokit } from '@services/octokit/core'

import { DEFAULT_WORKFLOWS, shouldIncludeCloudflareWorkflow } from '@/routes/api/webhooks/handlers/flows/workflowTemplates'
import { encode } from '@utils/base64'
import { getDb, schema } from '@db'
import { projects } from '@db/schemas/projects/roadmap'
import {
  repositories,
  type GitHubRepository,
  type NewGitHubRepository
} from '@db/schemas/github/repos';

import { DEFAULT_GITHUB_OWNER } from "@github-utils";
import { Logger } from "@logging";

// --- Schemas ---

import { INFRA_TYPES, fetchTemplateFiles } from './templates';

const CreateRepoSchema = z.object({
    owner: z.string().default(DEFAULT_GITHUB_OWNER).describe('Organization or user owner'),
    name: z.string().describe('Repository name'),
    description: z.string().optional().describe('Repository description'),
    infrastructure: z.enum(INFRA_TYPES).describe('Infrastructure type (e.g., python_script, cloudflare_workers)'),
    private: z.boolean().optional().default(false),
    auto_init: z.boolean().optional().default(true),
})

const RetrofitSchema = z.object({
    owner: z.string().default(DEFAULT_GITHUB_OWNER),
    repos: z.array(z.string()).optional(),
    force: z.boolean().optional().default(false),
})

// --- Helper Functions (Shared/Refactored) ---
async function upsertWorkflowFile(octokit: any, owner: string, repo: string, path: string, content: string, force: boolean) {
    try {
        let sha: string | undefined
        try {
            const { data } = await octokit.repos.getContent({ owner, repo, path })
            if ('sha' in data) sha = data.sha
        } catch (e: any) {
            if (e.status !== 404) throw e
        }

        if (sha && !force) return { status: 'skipped', message: 'File exists' }

        await octokit.repos.createOrUpdateFileContents({
            owner, repo, path,
            message: sha ? `chore: update ${path}` : `chore: add ${path}`,
            content: encode(content),
            sha,
        })
        return { status: 'success', message: sha ? 'Updated' : 'Created' }
    } catch (e: any) {
        return { status: 'failure', message: e.message || 'Unknown error' }
    }
}

export async function createGitHubIssue(env: Env, owner: string, repo: string, title: string, body?: string, assignees?: string[]) {
    const logger = new Logger(env, "GitHubTool:createGitHubIssue");
    logger.info(`Creating issue in ${owner}/${repo}`, { title, assignees });
    
    const octokit = await getOctokit(env);
    try {
        const { data } = await octokit.rest.issues.create({
            owner,
            repo,
            title,
            body,
            assignees
        });
        logger.info(`Issue created successfully`, { issueNumber: data.number, html_url: data.html_url });
        return data;
    } catch (e: any) {
        logger.error("Error creating GitHub issue", { error: e.message });
        throw e;
    }
}

export async function createGitHubComment(env: Env, owner: string, repo: string, issueNumber: number, body: string) {
    const logger = new Logger(env, "GitHubTool:createGitHubComment");
    logger.info(`Creating comment on ${owner}/${repo}#${issueNumber}`);

    const octokit = await getOctokit(env);
    try {
        const { data } = await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: issueNumber,
            body
        });
        logger.info(`Comment created successfully`, { commentId: data.id, html_url: data.html_url });
        return data;
    } catch (e: any) {
        logger.error("Error creating GitHub comment", { error: e.message });
        throw e;
    }
}

export async function updateGitHubIssue(env: Env, owner: string, repo: string, issueNumber: number, updates: { state?: 'open' | 'closed', title?: string, body?: string, assignees?: string[] }) {
    const logger = new Logger(env, "GitHubTool:updateGitHubIssue");
    logger.info(`Updating issue ${owner}/${repo}#${issueNumber}`, { updates });

    const octokit = await getOctokit(env);
    try {
        const { data } = await octokit.rest.issues.update({
            owner,
            repo,
            issue_number: issueNumber,
            ...updates
        });
        logger.info(`Issue updated successfully`, { html_url: data.html_url });
        return data;
    } catch (e: any) {
        logger.error("Error updating GitHub issue", { error: e.message });
        throw e;
    }
}

// --- Routes ---

const createRepoRoute = createRoute({
    method: 'post',
    path: '/github/repos/create',
    operationId: 'toolCreateRepo',
    description: 'Create a new GitHub repository with standard boilerplate',
    request: {
        body: {
            content: { 'application/json': { schema: CreateRepoSchema } }
        }
    },
    responses: {
        200: {
            description: 'Repo created',
            content: { 'application/json': { schema: z.object({ html_url: z.string() }) } }
        }
    }
})

const retrofitRoute = createRoute({
    method: 'post',
    path: '/github/repos/retrofit',
    operationId: 'toolRetrofitWorkflows',
    description: 'Add default workflows to existing repositories',
    request: {
        body: {
            content: { 'application/json': { schema: RetrofitSchema } }
        }
    },
    responses: {
        200: {
            description: 'Retrofit complete',
            content: {
                'application/json': {
                    schema: z.object({
                        summary: z.object({
                            total: z.number(),
                            success: z.number(),
                            failed: z.number()
                        })
                    })
                }
            }
        }
    }
})

// --- App ---

const app = new OpenAPIHono<{ Bindings: Env }>()

app.openapi(createRepoRoute, async (c) => {
    const { owner, name, description, infrastructure, private: isPrivate, auto_init } = c.req.valid('json')
    const logger = new Logger(c.env, "GitHubTool:CreateRepo");
    logger.info(`Creating repository ${owner}/${name}`, { infrastructure, isPrivate });

    const octokit = await getOctokit(c.env)
    const db = getDb(c.env.DB);

    // 1. Create Repo
    const { data: repo } = await octokit.repos.createInOrg({
        org: owner,
        name,
        description,
        private: isPrivate,
        auto_init // If true, creates initial commit
    })
    logger.info(`Repository created: ${repo.html_url}`);

    // Wait for propagation
    await new Promise(r => setTimeout(r, 2000))

    // 2. Generate Boilerplate Files (Dynamic Fetch)
    // Note: This is now async and fetches from github
    logger.info(`Fetching template files for ${infrastructure}`);
    const files = await fetchTemplateFiles(c.env, infrastructure, name);

    // 3 & 4. Commit Boilerplate and Default Workflows
    const allFilesToCommit = [
        ...Object.entries(files).map(([path, content]) => ({ path, content })),
        ...DEFAULT_WORKFLOWS.map(wf => ({ path: wf.path, content: wf.content }))
    ];

    for (const file of allFilesToCommit) {
        await upsertWorkflowFile(octokit, owner, name, file.path, file.content, false);
    }
    logger.info(`Committed ${allFilesToCommit.length} files and workflows`);

    // 5. Register in D1 (repos table)
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
    logger.info(`Registered in D1: github:${owner}/${name}`);

    return c.json({ html_url: repo.html_url })
})

app.openapi(retrofitRoute, async (c) => {
    const { owner, repos, force } = c.req.valid('json')
    const logger = new Logger(c.env, "GitHubTool:Retrofit");
    logger.info(`Starting Retrofit for ${owner}`, { repos, force });

    const octokit = await getOctokit(c.env)

    let targetRepos: any[] = []
    if (repos && repos.length > 0) {
        for (const r of repos) {
            try {
                const { data } = await octokit.repos.get({ owner, repo: r })
                targetRepos.push(data)
            } catch {
                // empty
            }
        }
    } else {
        // Limit to 100 for tool safety if no specific list
        const { data } = await octokit.repos.listForOrg({ org: owner, type: 'all', per_page: 100 })
        targetRepos = data
    }
    
    logger.info(`Targeting ${targetRepos.length} repositories`);

    let success = 0, failed = 0

    for (const repo of targetRepos) {
        try {
            const rootFiles: any[] = [] // Optimization: Skip checking root files for tool simplicity or query if needed
            // For simplicity in tool, assume we try to add all default workflows
            for (const wf of DEFAULT_WORKFLOWS) {
                // Check wrangler logic if strictly needed, or just try
                await upsertWorkflowFile(octokit, owner, repo.name, wf.path, wf.content, force)
            }
            success++
        } catch(e: any) {
            logger.warn(`Failed to retrofit ${repo.name}`, { error: e.message });
            failed++
        }
    }
    
    logger.info(`Retrofit complete. Success: ${success}, Failed: ${failed}`);

    return c.json({ summary: { total: targetRepos.length, success, failed } })
})

export default app




/**
 * Helper to get token from Env
 */
async function getToken(env: Env): Promise<string> {
  if (!env.GITHUB_TOKEN) {
    throw new Error("Missing GITHUB_TOKEN in environment");
  }
  return await env.GITHUB_TOKEN.get();
}

/**
 * Internal helper for authenticated GitHub API calls
 */
export async function fetchWithAuth(url: string, token: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "cloudflare-repo-analyzer",
      ...options.headers,
    },
  });
}

export async function fetchGitHubApi(env: Env, url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getToken(env);
  return fetchWithAuth(url, token, {
    ...options,
    headers: {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Cloudflare-Worker-MCP",
      ...options.headers,
    },
  });
}

/**
 * Internal helper for authenticated GitHub API calls that expect a JSON response.
 * Handles the response.ok check and parses the JSON.
 */
export async function fetchGitHubJson(env: Env, url: string, options: RequestInit = {}): Promise<any> {
  const response = await fetchGitHubApi(env, url, options);
  if (!response.ok) {
    throw new Error(`GitHub API error (${response.status}): ${await response.text()}`);
  }
  return response.json();
}

/**
 * Verify GitHub Token Validity
 */
export async function verifyGitHubToken(env: Env): Promise<{
  valid: boolean;
  user?: string;
  scopes?: string[];
  error?: string;
}> {
  const logger = new Logger(env, "GitHubTool:VerifyToken");
  try {
    const response = await fetchGitHubApi(env, "https://api.github.com/user");

    if (!response.ok) {
        logger.warn(`Token verification failed: ${response.status}`);
      if (response.status === 401) {
        return { valid: false, error: "Invalid or expired token (401)" };
      }
      return { valid: false, error: `GitHub API error: ${response.status} ${await response.text()}` };
    }

    const data = await response.json() as any;
    const scopesHeader = response.headers.get("x-oauth-scopes");
    const scopes = scopesHeader ? scopesHeader.split(",").map(s => s.trim()) : [];
    
    logger.info(`Token verified for user: ${data.login}`, { scopes });

    return {
      valid: true,
      user: data.login,
      scopes
    };
  } catch (error: any) {
    logger.error("Token verification error", { error: error.message });
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

/**
 * Get the default branch name for a repository
 */
export async function getDefaultBranch(
  env: Env,
  owner: string,
  repo: string
): Promise<string> {
  const logger = new Logger(env, "GitHubTool:GetDefaultBranch");
  // logger.debug(`Getting default branch for ${owner}/${repo}`); 

  const url = `https://api.github.com/repos/${owner}/${repo}`;
  try {
    const data = await fetchGitHubJson(env, url);
    return data.default_branch;
  } catch (error: any) {
    logger.error(`Failed to fetch repo info`, { error: error });
    throw new Error(`Failed to fetch repo info: ${error.message}`);
  }
}

/**
 * Fetch file content from GitHub
 */
export async function fetchGitHubFile(
  env: Env,
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<string> {
  const logger = new Logger(env, "GitHubTool:FetchFile");
  // logger.debug(`Fetching file ${owner}/${repo}/${path} ref=${ref}`);

  // Use provided ref or fetch default branch
  const branch = ref || await getDefaultBranch(env, owner, repo);
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;

  let data: { content: string; encoding: string };
  try {
    data = await fetchGitHubJson(env, url);
  } catch (error: any) {
    logger.warn(`Failed to fetch file: ${path} - ${error.message}`);
    throw new Error(`Failed to fetch file ${path}: ${error.message}`);
  }

  if (data.encoding === "base64") {
    // Decode base64 content
    return atob(data.content.replace(/\n/g, ""));
  }

  return data.content || "";
}

/**
 * Fetch multiple files from GitHub
 */
export async function fetchGitHubFiles(
  env: Env,
  owner: string,
  repo: string,
  files: Array<{ path: string; start_line?: number; end_line?: number }>,
  ref?: string
): Promise<
  Array<{
    path: string;
    content: string;
    snippet?: string;
  }>
> {
  const logger = new Logger(env, "GitHubTool:FetchFiles");
  logger.info(`Fetching ${files.length} files from ${owner}/${repo}`);

  // Resolve branch once for all files if not provided
  const branch = ref || await getDefaultBranch(env, owner, repo);

  const results = await Promise.all(
    files.map(async (file) => {
      try {
        const content = await fetchGitHubFile(env, owner, repo, file.path, branch);

        // Extract snippet if line numbers provided
        let snippet: string | undefined;
        if (file.start_line && file.end_line) {
          const lines = content.split("\n");
          const start = Math.max(0, file.start_line - 1);
          const end = Math.min(lines.length, file.end_line);
          snippet = lines.slice(start, end).join("\n");
        }

        return {
          path: file.path,
          content,
          snippet: snippet || content,
        };
      } catch (error) {
        logger.error(`Error fetching ${file.path}`, { error: error }); 
        // console.error(`Error fetching ${file.path}:`, error);
        return {
          path: file.path,
          content: "",
          snippet: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    })
  );

  return results;
}

/**
 * Get repository structure
 */
export async function getRepoStructure(
  env: Env,
  owner: string,
  repo: string,
  path: string = "",
  ref?: string
): Promise<any> {
  const logger = new Logger(env, "GitHubTool:RepoStructure");
  const branch = ref || await getDefaultBranch(env, owner, repo);
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;

  return fetchGitHubJson(env, url);
}

/**
 * Search code in a repository
 */
export async function searchRepoCode(
  env: Env,
  owner: string,
  repo: string,
  query: string
): Promise<any> {
  const logger = new Logger(env, "GitHubTool:SearchCode");
  logger.info(`Searching code in ${owner}/${repo} query="${query}"`);
  const url = `https://api.github.com/search/code?q=${encodeURIComponent(
    query
  )}+repo:${owner}/${repo}`;

  return fetchGitHubJson(env, url);
}

/**
 * Extract code snippets from GitHub files based on line ranges
 */
export async function extractCodeSnippets(
  env: Env,
  owner: string,
  repo: string,
  files: Array<{
    file_path: string;
    start_line: number;
    end_line: number;
    relation_to_question: string;
  }>,
  ref?: string
): Promise<
  Array<{
    file_path: string;
    code: string;
    relation: string;
  }>
> {
  const logger = new Logger(env, "GitHubTool:ExtractSnippets");
  logger.info(`Extracting snippets for snippets`);

  const fetchFiles = files.map((f) => ({
    path: f.file_path,
    start_line: f.start_line,
    end_line: f.end_line,
  }));

  const results = await fetchGitHubFiles(env, owner, repo, fetchFiles, ref);

  return results.map((result, index) => ({
    file_path: result.path,
    code: result.snippet || "",
    relation: files[index].relation_to_question,
  }));
}

/**
 * Parse PR URL to extract owner, repo, and PR number
 */
export function parsePRUrl(prUrl: string): { owner: string; repo: string; prNumber: number } | null {
  const regex = new RegExp("github\\.com/([^/]+)/([^/]+)/pull/(\\d+)");
  const match = prUrl.match(regex);

  if (!match) {
    return null;
  }

  return {
    owner: match[1],
    repo: match[2],
    prNumber: parseInt(match[3], 10),
  };
}

/**
 * Get all comments from a PR (both review comments and issue comments)
 */
export async function getPRComments(
  env: Env,
  owner: string,
  repo: string,
  prNumber: number
): Promise<Array<{
  author: string;
  body: string;
  file_path?: string;
  line?: number;
  comment_type: 'review' | 'issue';
}>> {
  const logger = new Logger(env, "GitHubTool:PRComments");
  logger.info(`Fetching comments for PR ${owner}/${repo}#${prNumber}`);

  const reviewCommentsUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/comments`;
  const issueCommentsUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`;

  const [reviewComments, issueComments] = await Promise.all([
    fetchGitHubJson(env, reviewCommentsUrl),
    fetchGitHubJson(env, issueCommentsUrl)
  ]);

  // Combine and normalize comments
  const allComments = [
    ...(reviewComments as any[]).map((comment) => ({
      id: comment.id,
      author: comment.user?.login || "unknown",
      body: comment.body || "",
      file_path: comment.path,
      line: comment.line || comment.original_line,
      comment_type: 'review' as const,
    })),
    ...(issueComments as any[]).map((comment) => ({
      id: comment.id,
      author: comment.user?.login || "unknown",
      body: comment.body || "",
      comment_type: 'issue' as const,
    })),
  ];

  return allComments;
}

/**
 * Filter comments by author (case-insensitive partial match)
 */
export function filterCommentsByAuthor(
  comments: Array<{ author: string;[key: string]: any }>,
  authorFilter?: string
): Array<{ author: string;[key: string]: any }> {
  if (!authorFilter) {
    return comments;
  }

  const lowerFilter = authorFilter.toLowerCase();
  return comments.filter((comment) =>
    comment.author.toLowerCase().includes(lowerFilter)
  );
}

/**
 * Get the SHA of a reference (e.g., heads/main)
 */
export async function getRef(
  env: Env,
  owner: string,
  repo: string,
  ref: string // e.g. "heads/main" or "heads/feature-branch"
): Promise<string> {
  const logger = new Logger(env, "GitHubTool:GetRef");
  // logger.debug(`Getting ref ${ref} for ${owner}/${repo}`);

  const url = `https://api.github.com/repos/${owner}/${repo}/git/ref/${ref}`;
  try {
    const data = await fetchGitHubJson(env, url);
    return data.object.sha;
  } catch (error: any) {
    logger.warn(`Failed to get ref ${ref}: ${error.message}`);
    throw new Error(`Failed to get ref ${ref}: ${error.message}`);
  }
}

/**
 * Create a new branch from a base SHA
 */
export async function createBranch(
  env: Env,
  owner: string,
  repo: string,
  newBranchName: string,
  baseSha: string
): Promise<void> {
  const logger = new Logger(env, "GitHubTool:CreateBranch");
  logger.info(`Creating branch ${newBranchName} in ${owner}/${repo} from ${baseSha}`);

  const url = `https://api.github.com/repos/${owner}/${repo}/git/refs`;
  try {
    await fetchGitHubJson(env, url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: `refs/heads/${newBranchName}`,
        sha: baseSha,
      }),
    });
  } catch (error: any) {
    throw new Error(`Failed to create branch ${newBranchName}: ${error.message}`);
  }
}

/**
 * Create or Update a file (Commit)
 */
export async function createOrUpdateFile(
  env: Env,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string,
  sha?: string
): Promise<void> {
  const logger = new Logger(env, "GitHubTool:CreateOrUpdateFile");
  logger.info(`Writing file ${path} to ${owner}/${repo} branch=${branch}`);

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

  // Base64 encode content
  const encodedContent = btoa(unescape(encodeURIComponent(content))); // Robust utf-8 -> base64

  const body: any = {
    message,
    content: encodedContent,
    branch,
  };

  if (sha) {
    body.sha = sha;
  }

  try {
    await fetchGitHubJson(env, url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error: any) {
    throw new Error(`Failed to write file ${path}: ${error.message}`);
  }
}

/**
 * Create a Pull Request
 */
export async function createPullRequest(
  env: Env,
  owner: string,
  repo: string,
  title: string,
  body: string,
  head: string, // The feature branch (e.g. "my-feature")
  base: string // The target branch (e.g. "main")
): Promise<{ number: number; html_url: string }> {
  const logger = new Logger(env, "GitHubTool:CreatePR");
  logger.info(`Creating PR: ${title}`);
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls`;
  try {
    const data = await fetchGitHubJson(env, url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        body,
        head,
        base,
      }),
    });
    return {
      number: data.number,
      html_url: data.html_url,
    };
  } catch (error: any) {
    throw new Error(`Failed to create PR: ${error.message}`);
  }
}
