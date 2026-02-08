/**
 * @file src/tools/github.ts
 * @description Tools for GitHub repository management (creation, workflow retrofitting). Full unit testing should be running in health cron checks on the worker making operational api calls in jmbish04/testing-oktokit-commands`.
 * @owner AI-Builder
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { getOctokit } from '../octokit/core'
import { Bindings } from '../utils/hono'
import { DEFAULT_WORKFLOWS, shouldIncludeCloudflareWorkflow } from '../flows/workflowTemplates'
import { encode } from '../utils/base64'
import { getDb, schema } from '../db'

// --- Schemas ---

import { INFRA_TYPES, fetchTemplateFiles } from './templates';
import { repositories } from '../db/schema-repos';

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

export async function createGitHubIssue(env: Bindings, owner: string, repo: string, title: string, body?: string, assignees?: string[]) {
    const octokit = getOctokit(env);
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

export async function createGitHubComment(env: Bindings, owner: string, repo: string, issueNumber: number, body: string) {
    const octokit = getOctokit(env);
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

export async function updateGitHubIssue(env: Bindings, owner: string, repo: string, issueNumber: number, updates: { state?: 'open' | 'closed', title?: string, body?: string, assignees?: string[] }) {
    const octokit = getOctokit(env);
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

const app = new OpenAPIHono<{ Bindings: Bindings }>()

app.openapi(createRepoRoute, async (c) => {
    const { owner, name, description, infrastructure, private: isPrivate, auto_init } = c.req.valid('json')
    const octokit = getOctokit(c.env)
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
    const octokit = getOctokit(c.env)

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
