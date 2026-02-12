
/**
 * @file src/tools/comments.ts
 * @description Tools for extracting and managing PR comments.
 * @owner AI-Builder
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { getOctokit } from '../octokit/core'


// --- Schemas ---

const ExtractCommentsRequestSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    pull_number: z.number(),
})

const ExtractedCommentSchema = z.object({
    id: z.number(),
    path: z.string(),
    line: z.number().nullable(),
    start_line: z.number().nullable().optional(),
    original_line: z.number().nullable().optional(), // For older comments
    body: z.string(),
    diff_hunk: z.string().optional(),
    suggestion: z.string().optional(), // We'll try to parse this from the body if possible, or if GitHub provides it
    user: z.object({
        login: z.string(),
        avatar_url: z.string(),
    }),
    created_at: z.string(),
    html_url: z.string(),
})

const ExtractCommentsResponseSchema = z.object({
    success: z.boolean(),
    count: z.number(),
    view_url: z.string(),
    extraction_id: z.string(),
})

const GetCommentsResponseSchema = z.array(ExtractedCommentSchema)

// --- Routes ---

const extractRoute = createRoute({
    method: 'post',
    path: '/comments/extract',
    operationId: 'extractPrComments',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: ExtractCommentsRequestSchema,
                },
            },
        },
    },
    responses: {
        200: {
            content: {
                'application/json': {
                    schema: ExtractCommentsResponseSchema,
                },
            },
            description: 'Comments extracted successfully.',
        },
    },
    'x-agent': true,
    description: 'Extracts code comments from a PR, stores them, and posts a link on the PR.',
})

const getCommentsRoute = createRoute({
    method: 'get',
    path: '/comments/:id',
    operationId: 'getStoredComments',
    request: {
        params: z.object({
            id: z.string(),
        })
    },
    responses: {
        200: {
            content: {
                'application/json': {
                    schema: GetCommentsResponseSchema,
                },
            },
            description: 'Retrieve stored comments.',
        },
        404: {
            description: 'Comments not found',
        }
    },
    description: 'Public endpoint to retrieve stored comments for the viewer.',
})

// --- Handler ---

const commentsTools = new OpenAPIHono<{ Bindings: Env }>()

commentsTools.openapi(extractRoute, async (c) => {
    const { owner, repo, pull_number } = c.req.valid('json')
    const octokit = await getOctokit(c.env)

    // 1. Fetch Review Comments
    const { data: reviewComments } = await octokit.pulls.listReviewComments({
        owner,
        repo,
        pull_number,
    })

    // 2. Process Comments
    const extractedComments = reviewComments.map(comment => {
        // Check for suggestion in body (GitHub suggestions use ```suggestion block)
        const suggestionMatch = comment.body.match(/```suggestion\r?\n([\s\S]*?)\r?\n```/)
        const suggestion = suggestionMatch ? suggestionMatch[1] : undefined

        return {
            id: comment.id,
            path: comment.path,
            line: comment.line, // The line of the comment
            start_line: comment.start_line, // If multi-line
            original_line: comment.original_line,
            // Strip Gemini Code Assist priority badges (e.g., ![high](https://www.gstatic.com/codereviewagent/high-priority.svg))
            body: comment.body.replace(/!\[.*?\]\(https:\/\/www\.gstatic\.com\/codereviewagent\/.*?-priority\.svg\)/g, '').trim(),
            diff_hunk: comment.diff_hunk,
            suggestion,
            user: {
                login: comment.user.login,
                avatar_url: comment.user.avatar_url,
            },
            created_at: comment.created_at,
            html_url: comment.html_url
        }
    })

    // 3. Store in KV
    const extractionId = `${owner}-${repo}-${pull_number}-${Date.now()}`
    // Using a simpler ID for public URL but including enough entropy or PR details
    // For safety, maybe just a UUID? But for now let's use a readable ID.
    const storageKey = `COMMENTS_${extractionId}`

    await c.env.COMMENTS_KV.put(storageKey, JSON.stringify(extractedComments), {
        expirationTtl: 60 * 60 * 24 * 30 // 30 days
    })

    // 4. Construct Public URL
    // Assuming the frontend is served from the same origin
    const origin = new URL(c.req.url).origin
    const viewUrl = `${origin}/view-comments/${extractionId}`

    // 5. Post URL to PR
    await octokit.issues.createComment({
        owner,
        repo,
        issue_number: pull_number,
        body: `### 🤖 Code Comments Extracted\n\nI have extracted **${extractedComments.length}** code comments for easier triage.\n\n[**View Extracted Comments**](${viewUrl})`
    })

    return c.json({
        success: true,
        count: extractedComments.length,
        view_url: viewUrl,
        extraction_id: extractionId
    })
})

commentsTools.openapi(getCommentsRoute, async (c) => {
    const { id } = c.req.valid('param')
    const comments = await c.env.COMMENTS_KV.get(`COMMENTS_${id}`, 'json')

    if (!comments) {
        return c.json({ error: 'Comments not found' }, 404)
    }

    return c.json(comments as z.infer<typeof GetCommentsResponseSchema>)
})

export default commentsTools
