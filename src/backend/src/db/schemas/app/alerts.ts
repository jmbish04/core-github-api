/**
 * @file backend/src/db/schemas/app/alerts.ts
 * @description Drizzle schema for System & Security Alerts
 *
 * Alerts are the source of truth for the nav badge, alert tray, /alerts page,
 * and Sonner toast notifications on the frontend.
 *
 * Use `createAlert()` from `@alerts` to emit alerts from any backend module.
 * Alerts are gated by `ALERTS_CONFIG` in KV — check `src/alerts/config.ts`.
 */

import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import type { z } from 'zod';

// ─── Alert type & severity enums ───────────────────────────────────────────
export const ALERT_TYPES = ['health', 'webhook', 'security', 'deployment', 'agent', 'info'] as const;
export const ALERT_SEVERITIES = ['info', 'warning', 'error', 'critical'] as const;

export type AlertType = typeof ALERT_TYPES[number];
export type AlertSeverity = typeof ALERT_SEVERITIES[number];

// ─── Table definition ───────────────────────────────────────────────────────
export const alerts = sqliteTable('alerts', {
  id: text('id').primaryKey(), // UUID

  // Classification
  type: text('type', { enum: ALERT_TYPES }).notNull().default('info'),
  severity: text('severity', { enum: ALERT_SEVERITIES }).notNull().default('info'),

  // Content
  title: text('title').notNull(),
  description: text('description').notNull(),

  // Deep-link: clicking alert in tray/page navigates here. Use relative paths (e.g. '/health').
  link_url: text('link_url'),

  // Origin metadata
  process_origin: text('process_origin').notNull().default('system'),
  repo_origin: text('repo_origin'),
  worker_origin: text('worker_origin'),

  // Action flag (kept from original schema for backward compat)
  is_action_needed: integer('is_action_needed', { mode: 'boolean' }).notNull().default(false),
  action_required: text('action_required'),

  // Resolution (original semantic: "fixed" rather than just viewed)
  is_resolved: integer('is_resolved', { mode: 'boolean' }).notNull().default(false),
  timestamp_resolved: integer('timestamp_resolved', { mode: 'timestamp' }),
  resolved_by: text('resolved_by'),

  // Dismissal (UI-driven: user clicked dismiss / dismiss-all / dismiss-group)
  dismissed_at: text('dismissed_at'), // ISO timestamp — null means active
  dismissed_by: text('dismissed_by'), // 'user' | 'system' | agent id

  // Timestamps
  created_at: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  typeIdx: index('alerts_type_idx').on(table.type),
  severityIdx: index('alerts_severity_idx').on(table.severity),
  createdAtIdx: index('alerts_created_at_idx').on(table.created_at),
  dismissedIdx: index('alerts_dismissed_idx').on(table.dismissed_at),
}));

export type SelectAlert = typeof alerts.$inferSelect;
export type InsertAlert = typeof alerts.$inferInsert;

// ─── Derived Zod insert schema ────────────────────────────────────────────────

/**
 * Zod insert validator derived from the `alerts` Drizzle table.
 *
 * Field refinements are applied first (inside createInsertSchema), then .pick()
 * narrows the schema to client-writable fields only — excluding server-managed
 * columns (id, is_resolved, dismissed_at, dismissed_by, created_at, etc.).
 *
 * Use this instead of the inline z.object({...}) that previously lived in
 * backend/src/routes/api/frontend/alerts.ts.
 *
 * @example
 *   import { CreateAlertSchema } from '@db/schemas/app/alerts';
 *   alertsApi.post('/', zValidator('json', CreateAlertSchema), async (c) => {
 *     const body = c.req.valid('json');
 *   });
 */
export const CreateAlertSchema = createInsertSchema(alerts, {
  title: (s) => s.min(1).max(200),
  description: (s) => s.min(1).max(1000),
}).pick({
  type: true,
  severity: true,
  title: true,
  description: true,
  link_url: true,
  process_origin: true,
  repo_origin: true,
  is_action_needed: true,
  action_required: true,
}).required({
  // `type` and `severity` have DB defaults, but the API must require them
  // explicitly — `createAlert()` expects them as required fields.
  type: true,
  severity: true,
});

export type CreateAlertInput = z.infer<typeof CreateAlertSchema>;


