/**
 * @file src/tools/issues.ts
 * @description This file contains the implementation of the create issue tool.
 * @owner AI-Builder
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { getOctokit } from '@services/octokit/core'
import { DEFAULT_GITHUB_OWNER } from "@github-utils";
import { tool } from "@/ai/providers";

// --- 1. Zod Schema Definitions ---

const CreateIssueRequestSchema = z.object({
  owner: z.string().default(DEFAULT_GITHUB_OWNER).openapi({ example: 'octocat' }),
  repo: z.string().openapi({ example: 'Hello-World' }),
  title: z.string().openapi({ example: 'Bug: Something is broken' }),
  body: z.string().optional().openapi({ example: 'Here are the steps to reproduce...' }),
  labels: z.array(z.string()).optional().openapi({ example: ['bug', 'critical'] }),
})

const CreateIssueResponseSchema = z.object({
  id: z.number(),
  number: z.number(),
  html_url: z.string().url(),
  state: z.string(),
  title: z.string(),
  body: z.string().nullable(),
})

// --- 2. Core Implementation ---

export async function createIssue(env: Env, params: z.infer<typeof CreateIssueRequestSchema>) {
  const { owner, repo, title, body, labels } = params;
  const octokit = await getOctokit(env);

  const { data } = await octokit.issues.create({
    owner,
    repo,
    title,
    body,
    labels,
  });

  return {
    id: data.id,
    number: data.number,
    html_url: data.html_url,
    state: data.state,
    title: data.title,
    body: data.body ?? null,
  };
}

// --- 3. Tool Factory ---

export function makeIssueTools(env: Env) {
  return {
    createIssue: tool({
      description: 'Create a new issue in a GitHub repository.',
      parameters: CreateIssueRequestSchema,
      execute: async (params: any) => createIssue(env, params),
    } as any),
  };
}

// --- 4. Hono App and Routes ---

const issues = new OpenAPIHono<{ Bindings: Env }>()

issues.openapi(
  createRoute({
    method: 'post',
    path: '/issues/create',
    operationId: 'createIssue',
    request: { body: { content: { 'application/json': { schema: CreateIssueRequestSchema } } } },
    responses: {
      200: { content: { 'application/json': { schema: CreateIssueResponseSchema } }, description: 'Success' }
    },
    'x-agent': true,
    description: 'Create a new issue',
  }),
  async (c) => c.json(await createIssue(c.env, c.req.valid('json')))
)

export default issues

/**
 * @extension_point
 * This is a good place to add other issue-related tools,
 * such as listing, updating, or commenting on issues.
 */
