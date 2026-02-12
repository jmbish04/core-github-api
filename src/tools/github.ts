/**
 * @file src/tools/github.ts
 * @description Tools for GitHub repository management (creation, workflow retrofitting).
 * @owner AI-Builder
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { getOctokit } from '../octokit/core'
import { Bindings } from '../utils/hono'
import { DEFAULT_WORKFLOWS, shouldIncludeCloudflareWorkflow } from '../flows/workflowTemplates'
import { encode } from '../utils/base64'
import { getDb, schema } from '../db'

// --- Schemas ---

const CreateRepoSchema = z.object({
    owner: z.string().describe('Organization or user owner'),
    name: z.string().describe('Repository name'),
    description: z.string().optional().describe('Repository description'),
    private: z.boolean().optional().default(false),
    auto_init: z.boolean().optional().default(true),
})

const RetrofitSchema = z.object({
    owner: z.string(),
    repos: z.array(z.string()).optional(),
    force: z.boolean().optional().default(false),
})

// --- Helper Functions (Shared/Refactored) ---
// Note: In a larger refactor, these should move to a shared /utils/github.ts
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

// --- Routes ---

const createRepoRoute = createRoute({
    method: 'post',
    path: '/github/repos/create',
    operationId: 'toolCreateRepo',
    description: 'Create a new GitHub repository with default workflows',
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
    const { owner, name, description, private: isPrivate, auto_init } = c.req.valid('json')
    const octokit = getOctokit(c.env)

    // 1. Create Repo
    const { data: repo } = await octokit.repos.createInOrg({
        org: owner,
        name,
        description,
        private: isPrivate,
        auto_init
    })

    // Wait for propagation
    await new Promise(r => setTimeout(r, 2000))

    // 2. Add Workflows (Basic implementation)
    for (const wf of DEFAULT_WORKFLOWS) {
        await upsertWorkflowFile(octokit, owner, name, wf.path, wf.content, false)
    }

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
