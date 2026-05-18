/**
 * @file backend/src/db/schemas/ops/secrets.ts
 * @description Drizzle D1 schema for the Cloudflare Secrets Store reference table.
 *
 * `secretsConfig` is an audit/sync table that tracks which secrets have been
 * provisioned in the Cloudflare Secrets Store via the admin UI.
 *
 * The derived `CreateSecretSchema` replaces all manual Zod objects that previously
 * duplicated these field constraints. Import it anywhere a secret creation payload
 * must be validated.
 *
 * @example
 *   import { CreateSecretSchema } from '@db/schemas/ops/secrets';
 *   app.post('/secrets', zValidator('json', CreateSecretSchema), async (c) => {
 *     const { name, value, description } = c.req.valid('json');
 *   });
 */

import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createInsertSchema } from 'drizzle-zod';

// ─── Table definition ────────────────────────────────────────────────────────

/**
 * Stores references to secrets provisioned in Cloudflare Secrets Store.
 * The `name` is the canonical identifier used in Worker bindings.
 */
export const secretsConfig = sqliteTable('secrets_config', {
  /** Cloudflare-compatible secret name (alphanumeric, underscores, hyphens only). */
  name: text('name').primaryKey(),
  /** The plaintext secret value — stored only temporarily; prefer Secrets Store IDs for production. */
  value: text('value').notNull(),
  /** Optional human-readable description for the admin UI. */
  description: text('description'),
});

// ─── Derived Zod schema ───────────────────────────────────────────────────────

/**
 * Zod insert validator derived from the `secretsConfig` Drizzle table.
 *
 * Field refinements applied:
 *   - `name`:  .min(1) + must match /^[a-zA-Z0-9_-]+$/ (Cloudflare naming rules)
 *   - `value`: .min(1) (non-empty secret text)
 *   - `description`: optional (nullable in DB, stays optional here)
 *
 * Use this instead of hand-writing `z.object({ name: z.string()... })`.
 */
export const CreateSecretSchema = createInsertSchema(secretsConfig, {
  name: (s) => s.min(1).regex(/^[a-zA-Z0-9_-]+$/, 'Name must only contain letters, numbers, underscores, or hyphens'),
  value: (s) => s.min(1, 'Secret value must not be empty'),
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type InsertSecretConfig = typeof secretsConfig.$inferInsert;
export type SelectSecretConfig = typeof secretsConfig.$inferSelect;
// env.DB_WEBHOOKS env.DB
