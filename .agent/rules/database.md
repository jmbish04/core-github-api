# Database & D1 Governance

## 1. Drizzle ORM Mandate & Separation of Concerns
- **Drizzle ORM** is the strict standard for D1 interactions. Raw SQL bindings (`env.DB.prepare().run()`) are FORBIDDEN for application logic.
- **Strict D1 Instance Separation**: 
  - `DB` (Core App logic, e.g., Agent persistence, sessions). Must be initialized via `getDb(env.DB)`.
  - `DB_WEBHOOKS` (Stateless GitHub events, sync history). Must be initialized via `getWebhooksDb(env.DB_WEBHOOKS)`.
  - Never cross-contaminate logic or run migrations on the wrong bindings.

## 2. Schema and Migrations
- Schema definitions must reside in `@db/schema.ts` and `@db/schema-webhooks.ts`.
- Migrations MUST be generated via `drizzle-kit` and run via the deployment scripts (`pnpm run migrate:remote`). DO NOT write manual `.sql` migration files.
- `drizzle.config.ts` manages two separate connections depending on the `env` argument.

## 3. Batch API Mandate
- When performing loop-based insertions (e.g., skill tool mappings), use `db.insert().values([...])` with arrays, NOT individual inserts inside a loop.
- For cross-table batch operations, use `env.DB.batch()` to group related inserts into a single round-trip.
- Cascading deletes (`onDelete: 'cascade'`) must be used on FK references to prevent orphaned rows.

## 4. Modular Schema Organization
- Schemas are namespaced by domain under `@db/schemas/{domain}/` (e.g., `agents/`, `logs/`, `github/`).
- Each domain folder has its own `index.ts` barrel export.
- `schema.core.ts` explicitly controls which schemas participate in `drizzle.config.core.ts` migrations (excludes DB_WEBHOOKS-owned tables).
