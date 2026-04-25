import { Logger } from "@/lib/logger";
import { getDb } from "@db";
import { sql } from "drizzle-orm";
import type { JulesService } from "../service";

export async function healthProbe(service: JulesService): Promise<{
  status: "ok" | "degraded" | "failed";
  details: Record<string, any>;
}> {
  const logger = new Logger(service.env, "JulesHealth");
  const details: Record<string, any> = {
    sdk: "pending",
    apiKey: "pending",
    database: "pending"
  };

  let isDegraded = false;
  let isFailed = false;

  // 1. Check API Key
  try {
    const apiKey = await service.env.JULES_API_KEY.get();
    if (!apiKey) {
      details.apiKey = "missing";
      isDegraded = true; // Fallback might exist, but missing key is degraded
    } else {
      details.apiKey = "ok";
    }
  } catch (err: any) {
    logger.error("Failed to read JULES_API_KEY", { error: err.message });
    details.apiKey = "error";
    isFailed = true;
  }

  // 2. Check SDK Load
  try {
    const client = await service.getClient();
    if (client) {
      details.sdk = "ok";
    } else {
      details.sdk = "failed_to_load";
      isFailed = true;
    }
  } catch (err: any) {
    logger.error("Failed to load Jules SDK client", { error: err.message });
    details.sdk = "error";
    isFailed = true;
  }

  // 3. Check D1 Connection
  try {
    const db = getDb(service.env.DB);
    await db.run(sql`SELECT 1`);
    details.database = "ok";
  } catch (err: any) {
    logger.error("Database connection failed", { error: err.message });
    details.database = "error";
    isFailed = true;
  }

  const status = isFailed ? "failed" : isDegraded ? "degraded" : "ok";
  
  if (status !== "ok") {
    logger.warn(`JulesService health probe returned ${status}`, { details });
  } else {
    logger.info("JulesService health probe ok", { details });
  }

  return { status, details };
}
