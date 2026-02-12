/**
 * @file src/db/webhooks.ts
 * @description Drizzle ORM client for Webhooks DB
 * @owner AI-Builder
 */

import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema-webhooks'

export function getWebhooksDb(d1: D1Database) {
    return drizzle(d1, { schema })
}

export { schema }
