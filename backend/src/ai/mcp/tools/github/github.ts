/**
 * @file src/tools/github.ts
 * @description Tools for GitHub repository management (creation, workflow retrofitting). Full unit testing should be running in health cron checks on the worker making operational api calls in `${env.GITHUB_OWNER}/${env.HEALTH_TEST_REPO_NAME}`.
 * @owner AI-Builder
 */

import { fetchWithAuth, fetchGitHubJson, fetchGitHubRaw } from "./fetch";
export { fetchGitHubJson } from "./fetch";
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { getOctokit } from '@services/octokit/core'

import { DEFAULT_WORKFLOWS } from '@/routes/api/webhooks/handlers/flows/workflowTemplates'
import { encode, decode } from '@utils/base64'
import { getDb } from '@db'
import {
  repositories,
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


async function withOctokitAction(
    env: Env,
    actionName: string,
    loggerName: string,
    action: (octokit: any, logger: Logger) => Promise<any>
) {
    const logger = new Logger(env, loggerName);
    const octokit = await getOctokit(env);
    try {
        return await action(octokit, logger);
    } catch (e: any) {
        logger.error(`Error ${actionName}`, { error: e.message });
        throw e;
    }
}

export async function createGitHubIssue(env: Env, owner: string, repo: string, title: string, body?: string, assignees?: string[]) {
    return withOctokitAction(env, "creating GitHub issue", "GitHubTool:createGitHubIssue", async (octokit, logger) => {
        logger.info(`Creating issue in ${owner}/${repo}`, { title, assignees });
        const { data } = await octokit.rest.issues.create({ owner, repo, title, body, assignees });
        logger.info(`Issue created successfully`, { issueNumber: data.number, html_url: data.html_url });
        return data;
    });
}

export async function createGitHubComment(env: Env, owner: string, repo: string, issueNumber: number, body: string) {
    return withOctokitAction(env, "creating GitHub comment", "GitHubTool:createGitHubComment", async (octokit, logger) => {
        logger.info(`Creating comment on ${owner}/${repo}#${issueNumber}`);
        const { data } = await octokit.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body });
        logger.info(`Comment created successfully`, { commentId: data.id, html_url: data.html_url });
        return data;
    });
}

export async function updateGitHubIssue(env: Env, owner: string, repo: string, issueNumber: number, updates: { state?: 'open' | 'closed', title?: string, body?: string, assignees?: string[] }) {
    return withOctokitAction(env, "updating GitHub issue", "GitHubTool:updateGitHubIssue", async (octokit, logger) => {
        logger.info(`Updating issue ${owner}/${repo}#${issueNumber}`, { updates });
        const { data } = await octokit.rest.issues.update({ owner, repo, issue_number: issueNumber, ...updates });
        logger.info(`Issue updated successfully`, { html_url: data.html_url });
        return data;
    });
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

    // 3 & 4. Commit Files & Add Default Workflows
    const allFiles = [
        ...Object.entries(files).map(([path, content]) => ({ path, content })),
        ...DEFAULT_WORKFLOWS
    ];
    for (const { path, content } of allFiles) {
        await upsertWorkflowFile(octokit, owner, name, path, content, false);
    }
    logger.info(`Committed ${allFiles.length} boilerplate and workflow files`);

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
        const repoPromises = repos.map(async (r) => {
            try {
                const { data } = await octokit.repos.get({ owner, repo: r })
                return data
            } catch {
                return null
            }
        });
        const results = await Promise.all(repoPromises);
        targetRepos = results.filter(Boolean);
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




async function withGitHubAction<T>(
  promise: Promise<T>,
  action: string,
  loggerContext?: { logger: Logger; level: 'warn' | 'error' }
): Promise<T> {
  try {
    return await promise;
  } catch (e: any) {
    if (loggerContext) {
      loggerContext.logger[loggerContext.level](`Failed to ${action}: ${e.message}`);
    }
    throw new Error(`Failed to ${action}: ${e.message}`);
  }
}

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
    const token = await getToken(env); // await if needed, though getToken is async
    const response = await fetchWithAuth("https://api.github.com/user", token);

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

  const token = await getToken(env);
  const url = `https://api.github.com/repos/${owner}/${repo}`;

  const data = await withGitHubAction(
    fetchGitHubJson(url, token),
    "fetch repo info",
    { logger, level: 'error' }
  ) as any;
  return data.default_branch;
}

/**
 * Resolve branch to the provided ref or the default branch
 */
export async function resolveBranch(
  env: Env,
  owner: string,
  repo: string,
  ref?: string
): Promise<string> {
  return ref || await getDefaultBranch(env, owner, repo);
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

  const token = await getToken(env);
  // Use provided ref or fetch default branch
  const branch = await resolveBranch(env, owner, repo, ref);
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;

  let data: { content: string; encoding: string };
  try {
    data = await fetchGitHubJson(url, token) as { content: string; encoding: string };
  } catch (e: any) {
    logger.warn(`Failed to fetch file: ${path} (${e.message})`);
    throw e;
  }

  if (data.encoding === "base64") {
    // Decode base64 content
    return decode(data.content.replace(/\n/g, ""));
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

  const token = await getToken(env);
  // Resolve branch once for all files if not provided
  const branch = await resolveBranch(env, owner, repo, ref);

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
  const token = await getToken(env);
  const branch = await resolveBranch(env, owner, repo, ref);
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;

  return await withGitHubAction(
    fetchGitHubJson(url, token),
    "get repo structure",
    { logger, level: 'warn' }
  );
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
  const token = await getToken(env);
  const url = `https://api.github.com/search/code?q=${encodeURIComponent(
    query
  )}+repo:${owner}/${repo}`;

  return await withGitHubAction(
    fetchGitHubJson(url, token),
    "search repo code",
    { logger, level: 'warn' }
  );
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
  logger.info(`Extracting snippets for ${files.length} files`);

  // Map to the format expected by fetchGitHubFiles
  const fetchInput = files.map(f => ({
    path: f.file_path,
    start_line: f.start_line,
    end_line: f.end_line
  }));

  const results = await fetchGitHubFiles(env, owner, repo, fetchInput, ref);

  // Map the results back to the expected output format
  return results.map((result, index) => ({
    file_path: files[index].file_path,
    code: result.snippet || `Error: Failed to extract snippet`,
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
  const token = await getToken(env);
  // Fetch both review comments (inline code) and issue comments (general PR) in parallel
  const reviewCommentsUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/comments`;
  const issueCommentsUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`;

  const [reviewComments, issueComments] = await Promise.all([
    fetchGitHubJson(reviewCommentsUrl, token) as Promise<any[]>,
    fetchGitHubJson(issueCommentsUrl, token) as Promise<any[]>
  ]);

  const mapBaseComment = (comment: any) => ({
    id: comment.id,
    author: comment.user?.login || "unknown",
    body: comment.body || "",
  });

  // Combine and normalize comments
  const allComments = [
    ...reviewComments.map((comment) => ({
      ...mapBaseComment(comment),
      file_path: comment.path,
      line: comment.line || comment.original_line,
      comment_type: 'review' as const,
    })),
    ...issueComments.map((comment) => ({
      ...mapBaseComment(comment),
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

  const token = await getToken(env);
  const url = `https://api.github.com/repos/${owner}/${repo}/git/ref/${ref}`;
  const data = await withGitHubAction(
    fetchGitHubJson(url, token),
    `get ref ${ref}`,
    { logger, level: 'warn' }
  ) as any;
  return data.object.sha;
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

  const token = await getToken(env);
  const url = `https://api.github.com/repos/${owner}/${repo}/git/refs`;
  await withGitHubAction(
    fetchGitHubRaw(url, token, {
      method: "POST",
      body: JSON.stringify({
        ref: `refs/heads/${newBranchName}`,
        sha: baseSha,
      }),
    }),
    `create branch ${newBranchName}`
  );
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

  const token = await getToken(env);
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

  // Base64 encode content
  const encodedContent = encode(content);

  const body: any = {
    message,
    content: encodedContent,
    branch,
  };

  if (sha) {
    body.sha = sha;
  }

  await withGitHubAction(
    fetchGitHubRaw(url, token, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
    `write file ${path}`
  );
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
  const token = await getToken(env);
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls`;
  const data = await withGitHubAction(
    fetchGitHubJson(url, token, {
      method: "POST",
      body: JSON.stringify({
        title,
        body,
        head,
        base,
      }),
    }),
    "create PR"
  ) as any;
  return {
    number: data.number,
    html_url: data.html_url,
  };
}
