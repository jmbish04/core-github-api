
/**
 * @file src/tools/comments.ts
 * @description Tools for extracting and managing PR comments.
 * @owner AI-Builder
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { extractReviewCommentsAndPostReply } from '@services/github/pr-ingestion'


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
    error: z.string().optional(),
})

const GetCommentsResponseSchema = z.array(ExtractedCommentSchema)

// --- Routes ---

const extractRoute = createRoute({
    method: 'post',
    path: '/extract',
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
        500: {
            content: {
                'application/json': {
                    schema: ExtractCommentsResponseSchema,
                },
            },
            description: 'Extraction failed.',
        },
    },
    'x-agent': true,
    description: 'Extracts code comments from a PR, stores them, and posts a link on the PR.',
})

const getCommentsRoute = createRoute({
    method: 'get',
    path: '/:id',
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

const getCommentsByPrRoute = createRoute({
    method: 'get',
    path: '/:owner/:repo/:number',
    operationId: 'getCommentsByPr',
    request: {
        params: z.object({
            owner: z.string(),
            repo: z.string(),
            number: z.string(),
        })
    },
    responses: {
        200: {
            content: {
                'application/json': {
                    schema: GetCommentsResponseSchema,
                },
            },
            description: 'Retrieve latest extracted comments for PR.',
        },
        404: {
            description: 'Comments not found',
        }
    },
    description: 'Retrieve latest extracted comments for a specific PR.',
})

// --- Handler ---

const commentsTools = new OpenAPIHono<{ Bindings: Env }>()

commentsTools.openapi(extractRoute, async (c) => {
    const { owner, repo, pull_number } = c.req.valid('json')
    const origin = new URL(c.req.url).origin
    
    const result = await extractReviewCommentsAndPostReply(c.env, owner, repo, pull_number, origin);

    if (!result.success) {
        return c.json({
            success: false,
            count: 0,
            view_url: '',
            extraction_id: '',
            error: result.error
        }, 500)
    }

    return c.json({
        success: true,
        count: result.count,
        view_url: result.view_url,
        extraction_id: result.extraction_id
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

commentsTools.openapi(getCommentsByPrRoute, async (c) => {
    const { owner, repo, number } = c.req.valid('param')
    
    // KV List to find the latest extraction for this PR
    // Prefix: COMMENTS_owner-repo-number-
    const prefix = `COMMENTS_${owner}-${repo}-${number}-`
    const list = await c.env.COMMENTS_KV.list({ prefix, limit: 1 })
    
    if (!list.keys.length) {
        return c.json({ error: 'No extracted comments found for this PR' }, 404)
    }

    // Keys are sorted, so the first one (or last depending on sort?)
    // Actually KV list order isn't strictly guaranteed to be reverse chronological by default unless we structured keys that way.
    // Our keys are `...-${Date.now()}`.
    // We should list all and sort, or reverse?
    // Let's list a few and pick the latest.
    // But since Date.now() is at the end, standard lexicographical sort might not give us latest first instantly.
    // Actually, `COMMENTS_owner-repo-number-timestamp`. 
    // If timestamp is fixed length, it sorts. But it varies.
    // Let's just grab the last key if we list them all? limiting to 1 with prefix might give the "start" which is oldest if lex sorted.
    
    // Better strategy: just fetch the list, sort keys in code, get latest.
    const allKeys = await c.env.COMMENTS_KV.list({ prefix })
    if (!allKeys.keys.length) {
         return c.json({ error: 'No extracted comments found for this PR' }, 404)
    }
    
    // Sort keys by timestamp suffix descending
    const sortedKeys = allKeys.keys.sort((a, b) => {
        const timeA = parseInt(a.name.split('-').pop() || '0')
        const timeB = parseInt(b.name.split('-').pop() || '0')
        return timeB - timeA
    })
    
    const latestKey = sortedKeys[0].name
    const comments = await c.env.COMMENTS_KV.get(latestKey, 'json')
    
    if (!comments) {
        return c.json({ error: 'Comments data missing' }, 404)
    }

    return c.json(comments as z.infer<typeof GetCommentsResponseSchema>)
})

export default commentsTools
