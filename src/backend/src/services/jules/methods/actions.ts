import { Logger } from "@/lib/logger";
import { getDb } from "@db";
import { julesJobs } from "@db/schemas/jules";
import { eq } from "drizzle-orm";
import { buildWebhookInstruction } from "../webhook-instruction";
import { getWorkerHost, updateSessionActivity } from "./lifecycle";
import { getSession } from "./retrieval";
import type { JulesService } from "../service";

export async function sendMessage(service: JulesService, sessionId: string, message: string): Promise<void> {
  const logger = new Logger(service.env, "JulesActions");
  const session = await getSession(service, sessionId);
  const enrichedMessage = `${message}\n\n${buildWebhookInstruction(getWorkerHost(service), sessionId)}`;

  if (typeof (session as any).sendMessage === "function") {
    await (session as any).sendMessage(enrichedMessage);
  } else if (typeof (session as any).chat === "function") {
    await (session as any).chat(enrichedMessage);
  } else {
    logger.warn(`Session ${sessionId} does not expose sendMessage or chat.`);
  }

  updateSessionActivity(service, sessionId).catch((err) =>
    logger.error(`Failed to update activity`, { error: err.message })
  );
}

export async function waitForState(service: JulesService, sessionId: string, state: string): Promise<unknown> {
  const session = await getSession(service, sessionId);
  return session.waitFor(state);
}

export async function approveSession(service: JulesService, sessionId: string): Promise<void> {
  const logger = new Logger(service.env, "JulesActions");
  const session = await getSession(service, sessionId);
  await session.approve();
  updateSessionActivity(service, sessionId, "active").catch((err) =>
    logger.error(`Failed to update activity`, { error: err.message })
  );
}

export async function reviseSessionPlan(service: JulesService, sessionId: string, feedback: string): Promise<void> {
  const logger = new Logger(service.env, "JulesActions");
  await sendMessage(
    service,
    sessionId,
    feedback || "Revise the current plan based on reviewer feedback and resubmit it for approval.",
  );
  updateSessionActivity(service, sessionId, "waiting_for_user").catch((err) =>
    logger.error(`Failed to update activity`, { error: err.message })
  );
}

export async function rejectSessionPlan(service: JulesService, sessionId: string, feedback?: string): Promise<void> {
  const logger = new Logger(service.env, "JulesActions");
  if (feedback) {
    await sendMessage(
      service,
      sessionId,
      `The current plan was rejected. Do not proceed. Reviewer feedback: ${feedback}`,
    );
  }
  updateSessionActivity(service, sessionId, "failed").catch((err) =>
    logger.error(`Failed to update activity`, { error: err.message })
  );
}

export async function updateJobStatus(
  service: JulesService,
  sessionId: string,
  status: "pending" | "blocked" | "completed" | "failed"
): Promise<void> {
  const logger = new Logger(service.env, "JulesActions");
  try {
    const db = getDb(service.env.DB);
    await db
      .update(julesJobs)
      .set({ status })
      .where(eq(julesJobs.sessionId, sessionId));
    logger.info(`Job status updated for ${sessionId}`, { status });
  } catch (error: any) {
    logger.error(`Failed to update job status for ${sessionId}`, { error: error.message });
  }
}
