/**
 * @file backend/src/db/schemas/logs/audit.ts
 * @description Drizzle ORM schema for Webhook Audit Logs.
 * Every agent-initiated GitHub mutation is logged here for full observability.
 */

import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';

export const auditLogs = sqliteTable('audit_logs', {
    id: text('id').primaryKey(),
    deliveryId: text('delivery_id').notNull(),
    repoFullName: text('repo_full_name').notNull(),
    triggerEvent: text('trigger_event').notNull(),
    analysisDetail: text('analysis_detail').notNull(),
    actionTaken: text('action_taken').notNull(),
    verificationStatus: text('verification_status').notNull(), // 'SUCCESS' | 'FAILURE'
    verificationReason: text('verification_reason'),
    createdAt: text('created_at').notNull(),
}, (table) => ({
    deliveryIdx: index('audit_delivery_idx').on(table.deliveryId),
    repoIdx: index('audit_repo_idx').on(table.repoFullName),
    eventIdx: index('audit_event_idx').on(table.triggerEvent),
}));

export type SelectAuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
