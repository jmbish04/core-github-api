/**
 * @file backend/src/db/schemas/logs/audit.ts
 * @description Drizzle ORM schema for Webhook Audit Logs.
 * Every agent-initiated GitHub mutation is logged here for full observability.
 */

import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';


