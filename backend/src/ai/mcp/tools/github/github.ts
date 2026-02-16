/**
 * @file src/tools/github.ts
 * @description Tools for GitHub repository management (creation, workflow retrofitting). Full unit testing should be running in health cron checks on the worker making operational api calls in jmbish04/testing-oktokit-commands`.
 * @owner AI-Builder
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { getOctokit } from '../../../../services/octokit/core'

import { DEFAULT_WORKFLOWS, shouldIncludeCloudflareWorkflow } from '../../../../flows/workflowTemplates'
import { encode } from '../../../../utils/base64'
import { getDb, schema } from '../../../../db'

// --- Schemas ---

import { INFRA_TYPES, fetchTemplateFiles } from './templates';
import { repositories } from '../../../../db/schemas/github/repos';

const CreateRepoSchema = z.object({
    owner: z.string().default('jmbish04').describe('Organization or user owner'),
    name: z.string().describe('Repository name'),
    description: z.string().optional().describe('Repository description'),
    infrastructure: z.enum(INFRA_TYPES).describe('Infrastructure type (e.g., python_script, cloudflare_workers)'),
    private: z.boolean().optional().default(false),
    auto_init: z.boolean().optional().default(true),
})

const RetrofitSchema = z.object({
    owner: z.string().default('jmbish04'),
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
    const octokit = await getOctokit(env);
    try {
        const { data } = await octokit.rest.issues.create({
            owner,
            repo,
            title,
            body,
            assignees
        });
        return data;
    } catch (e) {
        console.error("Error creating GitHub issue:", e);
        return null;
    }
}

export async function createGitHubComment(env: Env, owner: string, repo: string, issueNumber: number, body: string) {
    const octokit = await getOctokit(env);
    try {
        const { data } = await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: issueNumber,
            body
        });
        return data;
    } catch (e) {
        console.error("Error creating GitHub comment:", e);
        return null;
    }
}

export async function updateGitHubIssue(env: Env, owner: string, repo: string, issueNumber: number, updates: { state?: 'open' | 'closed', title?: string, body?: string, assignees?: string[] }) {
    const octokit = await getOctokit(env);
    try {
        const { data } = await octokit.rest.issues.update({
            owner,
            repo,
            issue_number: issueNumber,
            ...updates
        });
        return data;
    } catch (e) {
        console.error("Error updating GitHub issue:", e);
        return null;
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

    // Wait for propagation
    await new Promise(r => setTimeout(r, 2000))

    // 2. Generate Boilerplate Files (Dynamic Fetch)
    // Note: This is now async and fetches from github
    const files = await fetchTemplateFiles(c.env, infrastructure, name);

    // 3. Commit Files
    for (const [path, content] of Object.entries(files)) {
        await upsertWorkflowFile(octokit, owner, name, path, content, false);
    }

    // 4. Add Default Workflows
    for (const wf of DEFAULT_WORKFLOWS) {
        await upsertWorkflowFile(octokit, owner, name, wf.path, wf.content, false)
    }

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

    return c.json({ html_url: repo.html_url })
})

app.openapi(retrofitRoute, async (c) => {
    const { owner, repos, force } = c.req.valid('json')
    const octokit = await getOctokit(c.env)

    let targetRepos = []
    if (repos && repos.length > 0) {
        for (const r of repos) {
            try {
                const { data } = await octokit.repos.get({ owner, repo: r })
                targetRepos.push(data)
            } catch { }
        }
    } else {
        // Limit to 100 for tool safety if no specific list
        const { data } = await octokit.repos.listForOrg({ org: owner, type: 'all', per_page: 100 })
        targetRepos = data
    }

    let success = 0, failed = 0

    for (const repo of targetRepos) {
        try {
            const rootFiles = [] // Optimization: Skip checking root files for tool simplicity or query if needed
            // For simplicity in tool, assume we try to add all default workflows
            for (const wf of DEFAULT_WORKFLOWS) {
                // Check wrangler logic if strictly needed, or just try
                await upsertWorkflowFile(octokit, owner, repo.name, wf.path, wf.content, force)
            }
            success++
        } catch {
            failed++
        }
    }

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
 * Verify GitHub Token Validity
 */
export async function verifyGitHubToken(env: Env): Promise<{
  valid: boolean;
  user?: string;
  scopes?: string[];
  error?: string;
}> {
  try {
    const token = getToken(env);
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "Cloudflare-Worker-MCP",
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { valid: false, error: "Invalid or expired token (401)" };
      }
      return { valid: false, error: `GitHub API error: ${response.status} ${await response.text()}` };
    }

    const data = await response.json() as any;
    const scopesHeader = response.headers.get("x-oauth-scopes");
    const scopes = scopesHeader ? scopesHeader.split(",").map(s => s.trim()) : [];

    return {
      valid: true,
      user: data.login,
      scopes
    };
  } catch (error) {
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
  const token = getToken(env);
  const url = `https://api.github.com/repos/${owner}/${repo}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Cloudflare-Worker-MCP",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch repo info: ${response.status}`);
  }

  const data = await response.json() as any;
  return data.default_branch;
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
  const token = getToken(env);
  // Use provided ref or fetch default branch
  const branch = ref || await getDefaultBranch(env, owner, repo);
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Cloudflare-Worker-MCP",
    },
  });

  if (!response.ok) {
    throw new Error(
      `GitHub API error (${response.status}): ${await response.text()}`
    );
  }

  const data = (await response.json()) as { content: string; encoding: string };

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
  const token = getToken(env);
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
        console.error(`Error fetching ${file.path}:`, error);
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
  const token = getToken(env);
  const branch = ref || await getDefaultBranch(env, owner, repo);
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Cloudflare-Worker-MCP",
    },
  });

  if (!response.ok) {
    throw new Error(
      `GitHub API error (${response.status}): ${await response.text()}`
    );
  }

  return await response.json();
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
  const token = getToken(env);
  const url = `https://api.github.com/search/code?q=${encodeURIComponent(
    query
  )}+repo:${owner}/${repo}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Cloudflare-Worker-MCP",
    },
  });

  if (!response.ok) {
    throw new Error(
      `GitHub API error (${response.status}): ${await response.text()}`
    );
  }

  return await response.json();
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
  const token = getToken(env);
  const branch = ref || await getDefaultBranch(env, owner, repo);

  const snippets = await Promise.all(
    files.map(async (file) => {
      try {
        const content = await fetchGitHubFile(
          env,
          owner,
          repo,
          file.file_path,
          branch
        );

        const lines = content.split("\n");
        const start = Math.max(0, file.start_line - 1);
        const end = Math.min(lines.length, file.end_line);
        const code = lines.slice(start, end).join("\n");

        return {
          file_path: file.file_path,
          code,
          relation: file.relation_to_question,
        };
      } catch (error) {
        console.error(`Error extracting snippet from ${file.file_path}:`, error);
        return {
          file_path: file.file_path,
          code: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          relation: file.relation_to_question,
        };
      }
    })
  );

  return snippets;
}

/**
 * Parse PR URL to extract owner, repo, and PR number
 */
export function parsePRUrl(prUrl: string): { owner: string; repo: string; prNumber: number } | null {
  const regex = /github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/;
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
  const token = getToken(env);
  // Get review comments (inline code comments)
  const reviewCommentsUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/comments`;
  const reviewCommentsResponse = await fetch(reviewCommentsUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Cloudflare-Worker-MCP",
    },
  });

  if (!reviewCommentsResponse.ok) {
    throw new Error(
      `GitHub API error (${reviewCommentsResponse.status}): ${await reviewCommentsResponse.text()}`
    );
  }

  const reviewComments = await reviewCommentsResponse.json() as any[];

  // Get issue comments (general PR comments)
  const issueCommentsUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`;
  const issueCommentsResponse = await fetch(issueCommentsUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Cloudflare-Worker-MCP",
    },
  });

  if (!issueCommentsResponse.ok) {
    throw new Error(
      `GitHub API error (${issueCommentsResponse.status}): ${await issueCommentsResponse.text()}`
    );
  }

  const issueComments = await issueCommentsResponse.json() as any[];

  // Combine and normalize comments
  const allComments = [
    ...reviewComments.map((comment) => ({
      id: comment.id,
      author: comment.user?.login || "unknown",
      body: comment.body || "",
      file_path: comment.path,
      line: comment.line || comment.original_line,
      comment_type: 'review' as const,
    })),
    ...issueComments.map((comment) => ({
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
  const token = getToken(env);
  const url = `https://api.github.com/repos/${owner}/${repo}/git/ref/${ref}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Cloudflare-Worker-MCP",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get ref ${ref}: ${response.status} ${await response.text()}`);
  }

  const data = await response.json() as any;
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
  const token = getToken(env);
  const url = `https://api.github.com/repos/${owner}/${repo}/git/refs`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Cloudflare-Worker-MCP",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ref: `refs/heads/${newBranchName}`,
      sha: baseSha,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create branch ${newBranchName}: ${response.status} ${errorText}`);
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
  const token = getToken(env);
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

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Cloudflare-Worker-MCP",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Failed to write file ${path}: ${response.status} ${await response.text()}`);
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
  const token = getToken(env);
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Cloudflare-Worker-MCP",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title,
      body,
      head,
      base,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create PR: ${response.status} ${await response.text()}`);
  }

  const data = await response.json() as any;
  return {
    number: data.number,
    html_url: data.html_url,
  };
}
