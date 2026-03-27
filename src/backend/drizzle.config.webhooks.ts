import { defineConfig } from "drizzle-kit";

/**
 * Drizzle config for DB_WEBHOOKS.
 *
 * GOVERNANCE: This instance is STRICTLY for high-volume GitHub webhook event
 * storage and webhook operation config. Do NOT add non-webhook tables here.
 * All logs, health, and operational tables belong in drizzle.config.core.ts.
 *
 * Owned tables (all in schemas/github/webhooks.ts):
 *   - webhook_deliveries   (raw delivery log)
 *   - pullRequest, push, checkRun, workflowRun ... (event-specific slices)
 *   - searches, repoAnalysis  (search workflow state — keyed by webhook session)
 *   - dailyTrends, researchJudgeLogs, trendingRepos
 *
 * Owned tables (schemas/webhooks/automations.ts):
 *   - webhook_configs       (per-repo automation toggles)
 *
 * ⛔ NOT here: audit_logs, automation_logs, system_logs, health_runs, request_logs
 */
export default defineConfig({
    schema: [
        "./src/backend/src/db/schemas/github/webhooks.ts",
        "./src/backend/src/db/schemas/webhooks/automations.ts",
    ],
    out: "./migrations/webhooks",
    dialect: "sqlite",
    driver: "d1-http",
});
