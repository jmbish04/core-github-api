import { Logger } from "@/lib/logger";
import { getDb } from "@db";
import { sql } from "drizzle-orm";
import type { LearningAgent } from "@/ai/agents/backend/LearningAgent";

export interface HealthStepResult {
  name: string;
  status: "success" | "failure";
  message: string;
  durationMs: number;
  details?: Record<string, string>;
}

export async function healthProbe(agent: LearningAgent): Promise<HealthStepResult> {
  const start = Date.now();
  const env = agent.getEnv();
  const logger = new Logger(env, "LearningAgent/healthProbe");
  const details: Record<string, string> = {};
  const errors: string[] = [];

  logger.info("Executing comprehensive health probe for LearningAgent");

  // 1. D1 Database Check
  try {
    if (!env.DB) throw new Error("DB binding is missing");
    const db = getDb(env.DB);
    // Simple query to verify DB is functioning
    await db.run(sql`SELECT 1`);
    details.database = "OK";
  } catch (e: any) {
    details.database = `FAIL: ${e.message}`;
    errors.push(`Database Check: ${e.message}`);
  }

  // 2. Workflow Bindings Check
  try {
    if (!env.CONTINUOUS_LEARNING_WORKFLOW) {
      details.hitlWorkflow = "FAIL: Missing binding";
      errors.push("Missing CONTINUOUS_LEARNING_WORKFLOW binding");
      logger.error("[LearningAgent/healthProbe] Missing CONTINUOUS_LEARNING_WORKFLOW binding - ERROR");
    } else {
      details.hitlWorkflow = "OK (Binding present)";
      logger.info("[LearningAgent/healthProbe] CONTINUOUS_LEARNING_WORKFLOW binding present - OK");
    }
  } catch (e: any) {
    details.hitlWorkflow = `FAIL: ${e.message}`;
    errors.push(`Workflow Bindings Check: ${e.message}`);
    logger.error(`[LearningAgent/healthProbe] Workflow Bindings Check: ${JSON.stringify(e)} - ERROR`);
  }

  // 3. Email Templater Service Binding Check
  try {
    if (!env.SEND_EMAIL) {
      details.emailService = "FAIL: Missing SEND_EMAIL binding";
      errors.push("Missing SEND_EMAIL binding");
      logger.error("[LearningAgent/healthProbe] Missing SEND_EMAIL binding - ERROR");
    } else {
      details.emailService = "OK (Binding present)";
      logger.info("[LearningAgent/healthProbe] SEND_EMAIL binding present - OK");
    }
  } catch (e: any) {
    details.emailService = `FAIL: ${e.message}`;
    errors.push(`Email Service Binding Check: ${e.message}`);
    logger.error(`[LearningAgent/healthProbe] Email Service Binding Check: ${JSON.stringify(e)} - ERROR`);
  }

  const isSuccess = errors.length === 0;

  if (!isSuccess) {
    logger.error("Health probe failed", { errors, details });
  }

  return {
    name: "LearningAgent Health",
    status: isSuccess ? "success" : "failure",
    message: isSuccess ? "LearningAgent is fully operational" : `Health check failed: ${errors.join(', ')}`,
    durationMs: Date.now() - start,
    details,
  };
}
