/**
 * @file db/schema.ts
 * Single re-export entry point for all Drizzle table definitions.
 * All tables are organized by domain under db/schemas/<domain>/index.ts.
 *
 * To add a new table:
 *   1. Create the file under db/schemas/<domain>/
 *   2. Export it from db/schemas/<domain>/index.ts
 *   3. That's it — this file picks it up automatically.
 */
export * from './schemas';
