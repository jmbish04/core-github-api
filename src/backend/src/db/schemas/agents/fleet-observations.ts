/**
 * @file schemas/agents/fleet-observations.ts
 * @description Drizzle schema for the `fleet_observations` table.
 *
 * Records every health failure / build error / runtime error / chat-correction
 * the LearningAgent observes across ANY worker in the fleet.
 * Keyed by `worker_name` with a `pattern_hash` for recurrence detection.
 *
 * This table lives in _this_ worker's DB (core-github-api) — it does NOT
 * represent the diagnosed worker's database.
 */
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const fleetObservations = sqliteTable('fleet_observations', {
  id: text('id').primaryKey(),

  // ── Target Worker Identity ──────────────────────────────────────────
  workerName: text('worker_name').notNull(),
  accountId: text('account_id'),
  repoOwner: text('repo_owner'),
  repoName: text('repo_name'),

  // ── Failure Classification ──────────────────────────────────────────
  /** How the observation was captured */
  source: text('source', {
    enum: ['probe', 'build', 'runtime', 'chat-correction'],
  }).notNull(),

  /** Nature of the failure */
  failureType: text('failure_type', {
    enum: ['health', 'build', 'runtime', 'pattern'],
  }).notNull(),

  failureMessage: text('failure_message').notNull(),

  // ── Recurrence Detection ────────────────────────────────────────────
  /**
   * SHA-256 of `worker_name + failure_type + normalized_message`.
   * Used for fast upsert and deduplication.
   */
  patternHash: text('pattern_hash').notNull(),
  recurrenceCount: integer('recurrence_count').notNull().default(1),

  // ── Context ─────────────────────────────────────────────────────────
  contextMetadata: text('context_metadata', { mode: 'json' }),

  // ── HITL Promotion ──────────────────────────────────────────────────
  hitlPromoted: integer('hitl_promoted').notNull().default(0),
  hitlRecordId: text('hitl_record_id'),

  // ── Timestamps ──────────────────────────────────────────────────────
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_fleet_obs_pattern_hash').on(table.patternHash),
  index('idx_fleet_obs_worker_name').on(table.workerName),
  index('idx_fleet_obs_source').on(table.source),
]);

export type FleetObservation = typeof fleetObservations.$inferSelect;
export type InsertFleetObservation = typeof fleetObservations.$inferInsert;
