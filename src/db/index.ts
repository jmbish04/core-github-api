/**
 * @file src/db/index.ts
 * @description Drizzle ORM database client initialization
 * @owner AI-Builder
 */

import { drizzle } from 'drizzle-orm/d1'
import type { D1Database } from '@cloudflare/workers-types'
import * as schema from './schema'

/**
 * Get a Drizzle client instance for the D1 database
 * @param d1 - The D1Database instance from the Cloudflare Worker environment
 * @returns A Drizzle client instance with the schema attached
 */
export function getDb(d1: D1Database) {
  return drizzle(d1, { schema })
}

// Re-export the schema for convenience
export * as schema from './schema'
