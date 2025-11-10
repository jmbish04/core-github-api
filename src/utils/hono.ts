/**
 * @file src/utils/hono.ts
 * @description This file contains Hono-related helper functions and types.
 * @owner AI-Builder
 */

import { OpenAPIHono } from '@hono/zod-openapi'
import type { D1Database } from '@cloudflare/workers-types'
import { v4 as uuidv4 } from 'uuid'

// Define the Bindings for the Cloudflare Worker
export type Bindings = {
  GITHUB_TOKEN: string
  LOG_LEVEL: string
  ETAG_KV: KVNamespace
  WORKER_API_KEY: string
  CORE_GITHUB_API: D1Database
  CLOUDFLARE_API_TOKEN?: string
  GITHUB_ACTION_CLOUDFLARE_ACCOUNT_ID?: string
}

// Create a new OpenAPIHono app with the defined Bindings
export const app = new OpenAPIHono<{ Bindings: Bindings }>()

/**
 * @extension_point
 * This is a good place to add custom Hono middleware or helper functions.
 */
