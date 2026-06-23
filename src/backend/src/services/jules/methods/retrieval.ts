import { Logger } from "@/lib/logger";
import type { JulesService } from "../service";
import { updateSessionActivity } from "./lifecycle";

export async function getSession(service: JulesService, sessionId: string) {
  const client = await service.getClient();
  return (client as any).session(sessionId);
}

export async function getSessionInfo(service: JulesService, sessionId: string) {
  const session = await getSession(service, sessionId);
  const logger = new Logger(service.env, "JulesRetrieval");
  logger.info(`[Jules - getSessionInfo] Getting session info for ${sessionId}`);
  const sessionInfo = session.info();
  logger.info(`[Jules - getSessionInfo] Got session info for ${sessionId}`, { sessionInfo });
  return sessionInfo;
}

export async function streamSession(service: JulesService, sessionId: string) {
  const logger = new Logger(service.env, "JulesRetrieval");
  const session = await getSession(service, sessionId);
  logger.info(`[Jules - streamSession] Streaming session ${sessionId}`);
  updateSessionActivity(service, sessionId).catch((err) =>
    logger.error(`[Jules - streamSession] Failed to update activity for ${sessionId}`, { error: err.message })
  );
  logger.info(`[Jules - streamSession] Returning session stream for ${sessionId}`);
  return session.stream();
}

export async function logStream(
  service: JulesService,
  session: any,
  handlers: Record<string, (activity: any) => void>
) {
  const logger = new Logger(service.env, "JulesRetrieval");
  logger.info(`[Jules - logStream] Logging stream for session ${session.id}`);
  for await (const activity of session.stream()) {
    const handler = handlers[activity.type];
    if (typeof handler === "function") {
      logger.info(`[Jules - logStream] Found handler for activity type ${activity.type}`);
      handler(activity);
    }
  }
}
