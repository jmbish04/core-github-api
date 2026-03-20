import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const requestLogs = sqliteTable('request_logs', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timestamp: text('timestamp').notNull(),
    level: text('level').notNull(),
    message: text('message').notNull(),
    method: text('method').notNull(),
    path: text('path').notNull(),
    status: integer('status').notNull(),
    latencyMs: integer('latency_ms').notNull(),
    payloadSizeBytes: integer('payload_size_bytes').notNull(),
    correlationId: text('correlation_id').notNull(),
    metadata: text('metadata'),
});
