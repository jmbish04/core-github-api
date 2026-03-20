
import { sqliteTable, text, integer, int } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Tracks individual execution runs of the health system.
 */
export const healthRuns = sqliteTable('health_runs', {
    id: text('id').primaryKey(), // uuid
    status: text('status', { enum: ['healthy', 'degraded', 'unhealthy', 'unknown'] }).notNull(),
    trigger: text('trigger', { enum: ['manual', 'scheduled', 'api'] }).default('manual'),
    duration_ms: integer('duration_ms').default(0),
    created_at: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    metadata: text('metadata', { mode: 'json' }) // e.g. agent versions, caller info
});

/**
 * Tracks detailed results for steps within a run.
 */
export const healthResults = sqliteTable('health_results', {
    id: text('id').primaryKey(), // uuid
    run_id: text('run_id').notNull().references(() => healthRuns.id, { onDelete: 'cascade' }),

    // Categorization
    category: text('category', { enum: ['github', 'ai', 'api', 'webhooks', 'mcp', 'agents', 'browser', 'git', 'sandbox', 'research', 'planning'] }).notNull(),
    name: text('name').notNull(), // e.g. "Orchestrator Accessibility", "Secrets Permissions"

    // Status
    status: text('status', { enum: ['success', 'failure', 'pending', 'skipped'] }).notNull(),
    message: text('message'), // Short failure reason

    // Rich Data
    details: text('details', { mode: 'json' }), // Full error stack, response body, latency stats
    duration_ms: integer('duration_ms').default(0),
    ai_suggestion: text('ai_suggestion'), // AI remediation hints from diagnostician

    timestamp: text('timestamp').default(sql`CURRENT_TIMESTAMP`)
});

/**
 * Dynamic test definitions — configurable health checks stored in D1.
 * Allows runtime registration of new endpoints/services to monitor.
 */
export const healthTestDefinitions = sqliteTable('health_test_definitions', {
    id: text('id').primaryKey(), // uuid
    name: text('name').notNull().unique(),
    target: text('target').notNull(), // URL or service identifier
    method: text('method', { enum: ['GET', 'POST'] }).default('GET'),
    expected_status: integer('expected_status').default(200),
    frequency_seconds: integer('frequency_seconds').default(604800), // weekly default
    criticality: text('criticality', { enum: ['low', 'medium', 'high', 'critical'] }).default('medium'),
    enabled: integer('enabled', { mode: 'boolean' }).default(true),
    created_at: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updated_at: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});
