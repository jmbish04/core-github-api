/**
 * @file src/tools/prs.ts
 * @description This file contains the implementation of the open pull request tool.
 * @owner AI-Builder
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { getOctokit } from '@services/octokit/core'
import { DEFAULT_GITHUB_OWNER } from "@github-utils";
import { tool } from "@/ai/providers";

// --- 1. Zod Schema Definitions ---

const OpenPrRequestSchema = z.object({
  owner: z.string().default(DEFAULT_GITHUB_OWNER).openapi({ example: 'octocat' }),
  repo: z.string().openapi({ example: 'Hello-World' }),
  head: z.string().openapi({ example: 'feature-branch' }),
  base: z.string().openapi({ example: 'main' }),
  title: z.string().openapi({ example: 'feat: new feature' }),
  body: z.string().optional().openapi({ example: 'This PR adds a new feature.' }),
})

const OpenPrResponseSchema = z.object({
  id: z.number(),
  number: z.number(),
  html_url: z.string().url(),
  state: z.string(),
  title: z.string(),
  body: z.string().nullable(),
})

const ListCommentsSchema = z.object({
  owner: z.string().default(DEFAULT_GITHUB_OWNER),
  repo: z.string(),
  number: z.number(),
})

const CreateCommentSchema = z.object({
  owner: z.string().default(DEFAULT_GITHUB_OWNER),
  repo: z.string(),
  number: z.number(),
  body: z.string(),
  path: z.string().optional(),
  line: z.number().optional(),
})

// --- 2. Core Implementation ---

export async function openPullRequest(env: Env, params: z.infer<typeof OpenPrRequestSchema>) {
  const { owner, repo, head, base, title, body } = params;
  const octokit = await getOctokit(env);

  const { data } = await octokit.pulls.create({
    owner,
    repo,
    head,
    base,
    title,
    body,
  });

  return {
    id: data.id,
    number: data.number,
    html_url: data.html_url,
    state: data.state,
    title: data.title,
    body: data.body,
  };
}

export async function listPrComments(env: Env, params: z.infer<typeof ListCommentsSchema>) {
  const { owner, repo, number } = params;
  const octokit = await getOctokit(env);

  const [issueComments, reviewComments] = await Promise.all([
    octokit.issues.listComments({ owner, repo, issue_number: number }),
    octokit.pulls.listReviewComments({ owner, repo, pull_number: number })
  ]);

  return [
    ...issueComments.data.map((C: any) => ({ ...C, type: 'issue' })),
    ...reviewComments.data.map((C: any) => ({ ...C, type: 'review' }))
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export async function createPrComment(env: Env, params: z.infer<typeof CreateCommentSchema>) {
  const { owner, repo, number, body, path, line } = params;
  const octokit = await getOctokit(env);

  if (path && line) {
    const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: number });
    const { data } = await octokit.pulls.createReviewComment({
      owner,
      repo,
      pull_number: number,
      body,
      path,
      line,
      commit_id: pr.head.sha
    });
    return data;
  } else {
    const { data } = await octokit.issues.createComment({
      owner,
      repo,
      issue_number: number,
      body
    });
    return data;
  }
}

// --- 3. Tool Factory ---

export function makePrTools(env: Env) {
  return {
    openPullRequest: tool({
      description: 'Open a new pull request in a GitHub repository.',
      parameters: OpenPrRequestSchema,
      execute: async (params: any) => openPullRequest(env, params),
    } as any),
    listPrComments: tool({
      description: 'List all comments (issue and review) for a pull request.',
      parameters: ListCommentsSchema,
      execute: async (params: any) => listPrComments(env, params),
    } as any),
    createPrComment: tool({
      description: 'Create a comment on a pull request (general or on a specific line of code).',
      parameters: CreateCommentSchema,
      execute: async (params: any) => createPrComment(env, params),
    } as any),
  };
}

// --- 4. Hono App and Routes ---

const prs = new OpenAPIHono<{ Bindings: Env }>()

prs.openapi(
  createRoute({
    method: 'post',
    path: '/prs/open',
    operationId: 'openPullRequest',
    request: { body: { content: { 'application/json': { schema: OpenPrRequestSchema } } } },
    responses: {
      200: { content: { 'application/json': { schema: OpenPrResponseSchema } }, description: 'Success' }
    },
    'x-agent': true,
    description: 'Open a new pull request',
  }),
  async (c) => c.json(await openPullRequest(c.env, c.req.valid('json')))
)

prs.openapi(
  createRoute({
    method: 'get',
    path: '/prs/comments/list',
    operationId: 'listPrComments',
    request: { query: ListCommentsSchema },
    responses: {
      200: { content: { 'application/json': { schema: z.array(z.any()) } }, description: 'Success' }
    },
    description: 'List PR comments',
  }),
  async (c) => {
    // Handling query override for number string -> number conversion if needed
    const query = c.req.valid('query');
    return c.json(await listPrComments(c.env, { ...query, number: Number(query.number) }))
  }
)

prs.openapi(
  createRoute({
    method: 'post',
    path: '/prs/comments/create',
    operationId: 'createPrComment',
    request: { body: { content: { 'application/json': { schema: CreateCommentSchema } } } },
    responses: {
      200: { content: { 'application/json': { schema: z.any() } }, description: 'Success' }
    },
    description: 'Create PR comment',
  }),
  async (c) => c.json(await createPrComment(c.env, c.req.valid('json')))
)

export default prs

/**
 * @extension_point
 * This is a good place to add other PR-related tools,
 * such as listing, merging, or closing pull requests.
 */
