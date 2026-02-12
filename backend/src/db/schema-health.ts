
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
    category: text('category', { enum: ['github', 'ai', 'api'] }).notNull(),
    name: text('name').notNull(), // e.g. "Orchestrator Accessibility", "Secrets Permissions"

    // Status
    status: text('status', { enum: ['success', 'failure', 'pending', 'skipped'] }).notNull(),
    message: text('message'), // Short failure reason

    // Rich Data
    details: text('details', { mode: 'json' }), // Full error stack, response body, latency stats
    duration_ms: integer('duration_ms').default(0),

    timestamp: text('timestamp').default(sql`CURRENT_TIMESTAMP`)
});
