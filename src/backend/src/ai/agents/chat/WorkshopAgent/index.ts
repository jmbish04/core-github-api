/**
 * @file WorkshopAgent/index.ts
 * @description WorkshopAgent — Agent structure. Orchestrates project
 *              creation, task decomposition, repo initialization, and plan
 *              ingestion for the Workshop Wizard UI.
 */
import { callable } from "agents";
import { type StructuredChatResult, BaseAgent } from "@/ai/providers";
import * as methods from "./methods";
import type { WorkshopAgentState } from "./types";
import type { HealthCheck, HealthMode } from '@/ai/providers/agent-support/health';

export class WorkshopAgent extends BaseAgent<WorkshopAgentState> {
  protected get skills() {
    return ['spec-writing', 'planning', 'task-decomposition'];
  }
  protected get agentName() {
    return 'WorkshopAgent';
  }

  initialState: WorkshopAgentState = {
    status: "idle",
    history: [],
    repoContext: null,
    mcpCache: {},
  };

  async agentInit(): Promise<void> {
    // stateStore is initialized by BaseAgent.onStart()
  }

  // ── Layer 3 Health Checks ────────────────────────────────────────────

  protected override async agentHealthChecks(_mode: HealthMode): Promise<HealthCheck[]> {
    const activeProjectId = this.stateStore?.state?.activeProjectId;
    return [{
      name: 'agent.workshop.activeProject',
      layer: 3,
      category: 'custom',
      status: 'pass',
      durationMs: 0,
      message: activeProjectId ? `Active project: ${activeProjectId}` : 'No active project',
      details: { activeProjectId },
    }];
  }

  @callable()
  async chat(
    message: string,
    history: unknown[] = [],
    context?: unknown,
    source = "api",
    sessionId = "default",
    requestedModel?: string,
  ): Promise<StructuredChatResult> {
    this.logger.info(`[chat] Processing message: ${message.slice(0, 80)}...`, { source, sessionId });
    const result = await methods.chat(
      { ai: this.ai, store: this.stateStore, env: this.env },
      message,
      history,
      context,
      source,
      sessionId,
      requestedModel,
    );
    this.logger.info(`[chat] Response generated`);
    return result;
  }

  @callable()
  async orchestrateTasks(projectId: string) {
    this.logger.info(`[orchestrateTasks] Orchestrating tasks for project: ${projectId}`);
    const result = await methods.orchestrateTasks(
      { ai: this.ai, store: this.stateStore, env: this.env },
      projectId,
    );
    this.logger.info(`[orchestrateTasks] Task orchestration complete for project: ${projectId}`);
    return result;
  }

  @callable()
  async initializeRepository(
    projectId: string,
    params: { owner?: string; description?: string; visibility?: "public" | "private" },
  ) {
    this.logger.info(`[initializeRepository] Initializing repo for project: ${projectId}`, { owner: params.owner, visibility: params.visibility });
    const result = await methods.initializeRepository(
      { ai: this.ai, store: this.stateStore, env: this.env },
      projectId,
      params,
    );
    this.logger.info(`[initializeRepository] Repository initialized for project: ${projectId}`);
    return result;
  }

  @callable()
  async ingestProjectPlan(projectId: string, jsonPayload: string) {
    this.logger.info(`[ingestProjectPlan] Ingesting plan for project: ${projectId} (${jsonPayload.length} chars)`);
    const result = await methods.ingestProjectPlan(
      { ai: this.ai, store: this.stateStore, env: this.env },
      projectId,
      jsonPayload,
    );
    this.logger.info(`[ingestProjectPlan] Plan ingested for project: ${projectId}`);
    return result;
  }

  // ── HTTP Fallback ───────────────────────────────────────────────────

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    this.logger.info(`[onRequest] ${request.method} ${url.pathname}`);

    if (url.pathname === "/health") {
      return Response.json(await this.healthProbe());
    }

    if (request.method === "POST" && url.pathname === "/chat") {
      const payload = await request.json<{
        message?: string;
        history?: unknown[];
        context?: unknown;
        source?: string;
        sessionId?: string;
        model?: string;
      }>();
      this.logger.info(`[onRequest] Chat request via HTTP`, { source: payload.source, sessionId: payload.sessionId });
      return Response.json(
        await this.chat(
          payload.message || "",
          payload.history || [],
          payload.context,
          payload.source || "api",
          payload.sessionId || "default",
          payload.model,
        ),
      );
    }

    this.logger.warn(`[onRequest] Route not found: ${url.pathname}`);
    // Fall through to BaseAgent.onRequest for /stream and agent SDK routing
    return super.onRequest(request);
  }
}
