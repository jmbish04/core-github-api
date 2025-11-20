/**
 * @file src/db/index.ts
 * @description Database client initialization using Drizzle ORM
 * @owner AI-Builder
 */

import { drizzle } from 'drizzle-orm/d1'
import type { D1Database } from '@cloudflare/workers-types'
import * as schema from './schema'

/**
 * Initialize Drizzle ORM with D1 database
 * @param d1 - Cloudflare D1 database instance
 * @returns Drizzle database client
 */
export function initDb(d1: D1Database) {
  return drizzle(d1, { schema })
}

export * from './schema'
