/**
 * @file src/tools/comments.ts
 * @description Tools for extracting and managing PR comments.
 * @owner AI-Builder
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { extractReviewCommentsAndPostReply } from '@services/github/pr-ingestion'
import { tool } from "@/ai/providers";

// --- 1. Zod Schema Definitions ---

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
  original_line: z.number().nullable().optional(),
  body: z.string(),
  diff_hunk: z.string().optional(),
  suggestion: z.string().optional(),
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

// --- 2. Core Implementation ---

export async function extractPrComments(env: Env, params: z.infer<typeof ExtractCommentsRequestSchema>, origin?: string) {
  const { owner, repo, pull_number } = params;
  // Fallback origin if not provided (e.g., from an agent context)
  const effectiveOrigin = origin || (env as any).PUBLIC_URL || 'http://localhost:3000';
  
  const result = await extractReviewCommentsAndPostReply(env, owner, repo, pull_number, effectiveOrigin);

  if (!result.success) {
    return {
      success: false,
      count: 0,
      view_url: '',
      extraction_id: '',
      error: result.error
    };
  }

  return {
    success: true,
    count: result.count,
    view_url: result.view_url,
    extraction_id: result.extraction_id
  };
}

export async function getCommentsByPr(env: Env, owner: string, repo: string, number: string) {
  const prefix = `COMMENTS_${owner}-${repo}-${number}-`;
  const allKeys = await env.COMMENTS_KV.list({ prefix });
  
  if (!allKeys.keys.length) {
    return null;
  }

  const sortedKeys = allKeys.keys.sort((a, b) => {
    const timeA = parseInt(a.name.split('-').pop() || '0');
    const timeB = parseInt(b.name.split('-').pop() || '0');
    return timeB - timeA;
  });

  const latestKey = sortedKeys[0].name;
  return await env.COMMENTS_KV.get(latestKey, 'json');
}

// --- 3. Tool Factory ---

export function makeCommentTools(env: Env) {
  return {
    extractPrComments: tool({
      description: 'Extracts code comments from a PR, stores them, and posts a link on the PR.',
      parameters: ExtractCommentsRequestSchema,
      execute: async (params: any) => extractPrComments(env, params),
    } as any),
  };
}

// --- 4. Hono App and Routes ---

const commentsTools = new OpenAPIHono<{ Bindings: Env }>()

commentsTools.openapi(
  createRoute({
    method: 'post',
    path: '/extract',
    operationId: 'extractPrComments',
    request: { body: { content: { 'application/json': { schema: ExtractCommentsRequestSchema } } } },
    responses: {
      200: { content: { 'application/json': { schema: ExtractCommentsResponseSchema } }, description: 'Success' },
      500: { content: { 'application/json': { schema: ExtractCommentsResponseSchema } }, description: 'Error' }
    },
    'x-agent': true,
    description: 'Extract PR comments',
  }),
  async (c) => {
    const result = await extractPrComments(c.env, c.req.valid('json'), new URL(c.req.url).origin);
    return c.json(result, result.success ? 200 : 500);
  }
)

commentsTools.openapi(
  createRoute({
    method: 'get',
    path: '/:id',
    operationId: 'getStoredComments',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: { content: { 'application/json': { schema: GetCommentsResponseSchema } }, description: 'Success' },
      404: { description: 'Not found' }
    },
    description: 'Retrieve stored comments',
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const comments = await c.env.COMMENTS_KV.get(`COMMENTS_${id}`, 'json');
    if (!comments) return c.json({ error: 'Comments not found' }, 404);
    return c.json(comments as z.infer<typeof GetCommentsResponseSchema>);
  }
)

commentsTools.openapi(
  createRoute({
    method: 'get',
    path: '/:owner/:repo/:number',
    operationId: 'getCommentsByPr',
    request: { params: z.object({ owner: z.string(), repo: z.string(), number: z.string() }) },
    responses: {
      200: { content: { 'application/json': { schema: GetCommentsResponseSchema } }, description: 'Success' },
      404: { description: 'Not found' }
    },
    description: 'Retrieve latest PR comments',
  }),
  async (c) => {
    const { owner, repo, number } = c.req.valid('param');
    const comments = await getCommentsByPr(c.env, owner, repo, number);
    if (!comments) return c.json({ error: 'No extracted comments found for this PR' }, 404);
    return c.json(comments as z.infer<typeof GetCommentsResponseSchema>);
  }
)

export default commentsTools
