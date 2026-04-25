import { Logger } from "@/lib/logger";
import { getDb } from "@db";
import { julesSessions } from "@db/schemas/jules";
import { eq } from "drizzle-orm";
import { buildWebhookInstruction } from "../webhook-instruction";
import type { StartSessionParams } from "../types";
import type { JulesService } from "../service";


export async function updateSessionActivity(
  service: JulesService,
  sessionId: string,
  status?: "active" | "completed" | "failed" | "stuck" | "waiting_for_user"
): Promise<void> {
  const logger = new Logger(service.env, "JulesLifecycles");
  try {
    const db = getDb(service.env.DB);
    await db
      .update(julesSessions)
      .set({
        lastActivityAt: new Date(),
        updatedAt: new Date(),
        ...(status ? { status } : {}),
      })
      .where(eq(julesSessions.id, sessionId));
    logger.info(`Session activity updated for ${sessionId}`, { status });
  } catch (error: any) {
    logger.error(`[Jules - updateSessionActivity] DB update failed for session ${sessionId}`, { error: error.message });
  }
}

export function getWorkerHost(service: JulesService): string {
  const logger = new Logger(service.env, "JulesLifecycles");
  const defaultWorkerHost = "core-github-api.workers.dev";
  const workerHost = (service.env as any).WORKER_HOST || defaultWorkerHost;
  logger.info(`[Jules - getWorkerHost] Getting worker host`, { service, env: service.env, defaultWorkerHost, workerHost });
  if (workerHost === defaultWorkerHost) {
    logger.warn(`[Jules - getWorkerHost] Unable to obtain host from service worker; Falling back to default worker host: ${workerHost}`);
  }
  return workerHost;
}

export function buildSessionPayload(service: JulesService, params: StartSessionParams) {
  const sessionId = params.sessionId || crypto.randomUUID();
  const webhookInstruction = buildWebhookInstruction(getWorkerHost(service), sessionId);
  const enrichedPrompt = `${params.prompt}\n\n${webhookInstruction}`;
  const logger = new Logger(service.env, "JulesLifecycles");
  logger.info(`[Jules - buildSessionPayload] Building session payload`, { service, env: service.env, params, sessionId, webhookInstruction, enrichedPrompt });

  const options: Record<string, unknown> = {
    id: sessionId,
    prompt: enrichedPrompt,
    autoPr: params.autoPr ?? false,
  };

  if (typeof params.requireApproval === "boolean") {
    options.requireApproval = params.requireApproval;
    logger.info(`[Jules - buildSessionPayload] Requiring approval`, { service, env: service.env, params, sessionId, webhookInstruction, enrichedPrompt, options });
  }

  if (params.repo) {
    options.source = {
      github: `${params.repo.owner}/${params.repo.repo}`,
      baseBranch: params.repo.branch || "main",
    };
    logger.info(`[Jules - buildSessionPayload] Adding source`, { service, env: service.env, params, sessionId, webhookInstruction, enrichedPrompt, options });
  }

  return {
    sessionId,
    enrichedPrompt,
    options,
  };
}

export async function createSessionWithFallback(
  service: JulesService,
  client: any,
  params: StartSessionParams,
  payload: ReturnType<typeof buildSessionPayload>
) {
  const logger = new Logger(service.env, "JulesLifecycles");
  let session: any;
  try {
    session = await client.session(payload.options);
  } catch (sessionError: any) {
    logger.error(`[Jules - createSessionWithFallback] Failed to create initial session for ${params.repo?.owner}/${params.repo?.repo}. Attempting fallback...`, { error: sessionError });
    if (
      sessionError?.message?.includes("SourceNotFoundError") ||
      sessionError?.name === "SourceNotFoundError"
    ) {
      logger.warn(`[Jules - createSessionWithFallback] Source not found for ${params.repo?.owner}/${params.repo?.repo}. Retrying without source...`);
      delete payload.options.source;
      payload.options.autoPr = false;
      session = await client.session(payload.options);
    } else {
      logger.error(`[Jules - createSessionWithFallback] All attempts failed to create session for ${params.repo?.owner}/${params.repo?.repo}.`, { error: sessionError });
      throw sessionError;
    }
  }

  return session;
}

export async function persistSession(
  service: JulesService,
  sessionId: string,
  enrichedPrompt: string,
  params: StartSessionParams
): Promise<void> {
  const logger = new Logger(service.env, "JulesLifecycles");
  try {
    const db = getDb(service.env.DB);
    const now = new Date();
    await db
      .insert(julesSessions)
      .values({
        id: sessionId,
        prompt: enrichedPrompt,
        repoOwner: params.repo?.owner,
        repoName: params.repo?.repo,
        branch: params.repo?.branch || "main",
        status: "active",
        agentId: params.agentId,
        specialistClass: params.specialistClass,
        projectId: params.projectId,
        planningRequestId: params.planningRequestId,
        sessionRole: params.sessionRole,
        createdAt: now,
        updatedAt: now,
        lastActivityAt: now,
      })
      .onConflictDoNothing();
    logger.info(`[Jules - persistSession] Session persisted to D1: ${sessionId}`);
  } catch (error: any) {
    logger.error(`[Jules - persistSession] Failed to persist session to D1: ${sessionId}`, { error: error.message });
  }
}

export async function startSession(service: JulesService, params: StartSessionParams) {
  const logger = new Logger(service.env, "JulesLifecycles");
  const client = await service.getClient();
  const payload = buildSessionPayload(service, params);

  logger.info(`[Jules - startSession] Starting session ${payload.sessionId}`, { promptPreview: params.prompt });

  const session = await createSessionWithFallback(service, client as any, params, payload);

  const finalSessionId: string = session.id || payload.sessionId;
  logger.info(`[Jules - startSession] Session created successfully: ${finalSessionId}`);

  persistSession(service, finalSessionId, payload.enrichedPrompt, params).catch((err) =>
    logger.error("[Jules - startSession] Failed to persist session", { error: err.message })
  );

  return session;
}

export async function startParallelSessions(service: JulesService, paramsList: StartSessionParams[]) {
  const logger = new Logger(service.env, "JulesLifecycles");
  const client = await service.getClient();
  const payloads = paramsList.map((params) => ({
    params,
    payload: buildSessionPayload(service, params),
  }));

  let sessions: any[] = [];

  if (typeof (client as any).all === "function") {
    try {
      logger.info(`[Jules - startParallelSessions] Starting parallel sessions using client.all()`);
      sessions = await (client as any).all(payloads.map((entry) => entry.payload.options));
    } catch (error: any) {
      logger.warn("[Jules - startParallelSessions] client.all() failed, falling back to Promise.all(session())", { error: error.message });
    }
  }

  if (sessions.length === 0) {
    logger.info(`[Jules - startParallelSessions] Starting parallel sessions using Promise.all(session())`);
    sessions = await Promise.all(
      payloads.map((entry) =>
        createSessionWithFallback(service, client as any, entry.params, entry.payload),
      ),
    );
  }

  await Promise.all(
    sessions.map((session, index) =>
      persistSession(
        service,
        session.id || payloads[index]!.payload.sessionId,
        payloads[index]!.payload.enrichedPrompt,
        payloads[index]!.params,
      ).catch((err) =>
        logger.error("[Jules - startParallelSessions] Failed to persist parallel session to D1", { error: err.message }),
      ),
    ),
  );

  return sessions;
}
