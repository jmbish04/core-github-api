import { defineConfig } from "drizzle-kit";

/**
 * Drizzle config for DB (core).
 *
 * GOVERNANCE: This is the primary application database. Uses schema.core.ts
 * which explicitly EXCLUDES github/webhooks.ts and webhooks/automations.ts —
 * those are owned by DB_WEBHOOKS.
 *
 * DO NOT change schema to schema.ts — that barrel includes ALL tables including
 * webhook event tables which would duplicate them across both D1 instances.
 */
export default defineConfig({
    schema: "./src/backend/src/db/schema.core.ts",
    out: "./migrations/core",
    dialect: "sqlite",
    driver: "d1-http",
});
