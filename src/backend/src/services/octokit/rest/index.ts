/**
 * @file src/octokit/rest/index.ts
 * @description This file contains the implementation of the generic GitHub REST API proxy.
 * @owner AI-Builder
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { getOctokit } from '@services/octokit/core'

import { etagCache } from '@utils/etagCache'

// --- 1. Zod Schema Definitions ---

const RestResponseSchema = z.any().openapi({
  description: 'The response from the GitHub API.',
})

// --- NEW: Define a wrapper schema for POST requests ---
// This satisfies the OpenAI importer's need for a 'properties' field.
const PostRequestSchema = z.object({
  params: z.record(z.string(), z.any()).optional().openapi({
    description: "Parameters object for the Octokit method.",
    example: { "owner": "octocat", "repo": "Hello-World", "issue_number": 1 }
  }),
}).openapi({
  description: "Wrapper object for Octokit POST parameters."
})
// --- END NEW SCHEMA ---


// --- 2. Route Definitions ---

const getRoute = createRoute({
  method: 'get',
  path: '/:namespace/:method',
  operationId: 'getOctokitRestProxy', // Added in previous step
  request: {
    params: z.object({
      namespace: z.string(),
      method: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Successful response from the GitHub API.',
      content: {
        'application/json': {
          schema: RestResponseSchema,
        },
      },
    },
    304: {
      description: 'Not Modified.',
    },
  },
  description: 'Generic proxy for the GitHub REST API (GET requests).',
})

const postRoute = createRoute({
  method: 'post',
  path: '/:namespace/:method',
  operationId: 'postOctokitRestProxy', // Added in previous step
  request: {
    params: z.object({
      namespace: z.string(),
      method: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          // --- MODIFICATION: Use the new wrapper schema ---
          schema: PostRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Successful response from the GitHub API.',
      content: {
        'application/json': {
          schema: RestResponseSchema,
        },
      },
    },
  },
  description: 'Generic proxy for the GitHub REST API (POST requests).',
})


// --- 3. Hono App and Handler ---

const rest = new OpenAPIHono<{ Bindings: Env }>()

rest.use('*', etagCache())

const handler = async (c: any) => {
  const { namespace, method } = c.req.param() as { namespace: string; method: string }
  const octokit = await getOctokit(c.env)
  
  console.log(`[OctokitProxy] Request for ${namespace}.${method}`)
  console.log(`[OctokitProxy] octokit keys: ${Object.keys(octokit)}`)
  if (octokit['repos']) {
      console.log(`[OctokitProxy] octokit.repos keys: ${Object.keys(octokit['repos'])}`)
  }

  // @ts-expect-error
  if (!octokit[namespace] || !octokit[namespace][method]) {
    console.error(`[OctokitProxy] Method not found: ${namespace}.${method}`)
    return c.json({ error: 'Not Found' }, 404)
  }

  let params
  if (c.req.method === 'POST') {
    // --- MODIFICATION: Unwrap the params from the body object ---
    const body = (await c.req.json().catch(() => ({}))) as { params?: Record<string, any> }
    params = body.params || {}
    // --- END MODIFICATION ---
  } else {
    params = c.req.query()
  }

  // @ts-expect-error
  const { data, headers, status } = await octokit[namespace][method](params)

  return c.newResponse(JSON.stringify(data), {
    status,
    headers: headers as HeadersInit,
  })
}

rest.openapi(getRoute, handler as any)
rest.openapi(postRoute, handler as any)

export default rest

/**
 * @extension_point
 * This is a good place to add any custom logic to the REST API proxy,
 * such as response caching or filtering.
 */
