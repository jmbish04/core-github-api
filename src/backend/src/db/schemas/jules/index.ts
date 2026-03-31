/**
 * @file backend/src/db/schemas/jules/index.ts
 * @description Barrel export for all Jules-related D1 Drizzle schemas.
 *
 * Import from "@db/schemas/jules" (or via the root "@db" barrel) to access:
 *   - `julesSessions`      — active and historical Jules coding sessions
 *   - `julesJobs`          — top-level job tracking records (used by JulesOverseer)
 *   - `julesWebhookEvents` — inbound webhook event log from Jules
 *
 * @module DB/Schemas/Jules
 */

export * from "./sessions";
export * from "./jobs";
export * from "./webhook-events";
