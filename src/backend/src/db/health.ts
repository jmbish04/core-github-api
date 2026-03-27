/**
 * @file health/checks/db.ts
 * @description Health check for both D1 databases (DB + DB_WEBHOOKS).
 *
 * Verifies Drizzle can reach each binding by running a lightweight
 * `SELECT 1` style query.
 */

import { getDb, getWebhooksDb } from "@db";
import { sql } from "drizzle-orm";
import { HealthStepResult } from "@/health/types";

export async function checkHealth(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  const subChecks: Record<string, any> = {};

  const runCheck = async (name: string, fn: () => Promise<Record<string, unknown>>) => {
    const checkStart = Date.now();
    try {
      const result = await fn();
      subChecks[name] = { status: "OK", latency: Date.now() - checkStart, ...result };
    } catch (error) {
      subChecks[name] = {
        status: "FAILURE",
        latency: Date.now() - checkStart,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  // --- Core DB (DB) ---
  await runCheck("core_d1", async () => {
    if (!env.DB) throw new Error("DB binding missing");
    const db = getDb(env.DB);
    const query = 'SELECT 1 AS ok';
    const row = await db.get(sql.raw(query));
    return { message: `Core D1 reachable: "${query}" returned: ${JSON.stringify(row)} `, binding: "DB" };
  });

  // --- Webhooks DB (DB_WEBHOOKS) ---
  await runCheck("webhooks_d1", async () => {
    if (!env.DB_WEBHOOKS) throw new Error("DB_WEBHOOKS binding missing");
    const db = getWebhooksDb(env.DB_WEBHOOKS);
    const query = 'SELECT 1 AS ok';
    const row = await db.get(sql.raw(query));
    return { message: `Webhooks D1 reachable: "${query}" returned: ${JSON.stringify(row)} `, binding: "DB_WEBHOOKS" };
  });

  const hasFailure = Object.values(subChecks).some((c: any) => c.status === "FAILURE");

  return {
    name: "Database",
    status: hasFailure ? "failure" : "success",
    message: hasFailure ? "One or more D1 databases unreachable" : "All D1 databases healthy",
    durationMs: Date.now() - start,
    details: subChecks,
  };
}
