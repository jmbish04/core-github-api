/**
 * @file backend/src/services/jules/service.ts
 * @description Canonical Jules AI coding agent service.
 *
 * `JulesService` is the single point of integration with the `@google/jules-sdk`.
 * It wraps the SDK's session lifecycle, injects mandatory webhook reporting
 * instructions into every outgoing prompt, and persists session metadata in D1.
 *
 * @module Services/Jules
 */

import { Logger } from "@/lib/logger";
import type { StartSessionParams } from "./types";
import * as methods from "./methods";

/**
 * Service layer for the Google Jules autonomous coding agent.
 *
 * All Jules SDK interactions MUST go through this class. Do NOT import or
 * call `@google/jules-sdk` directly from routes or agents — use this service.
 *
 * @example
 * ```ts
 * const jules = JulesService.getInstance(env);
 * const session = await jules.startSession({ prompt: "Fix the bug in auth.ts", agentId: "workshop-abc" });
 * ```
 */
export class JulesService {
  /** Request-scoped singleton instance. Reset per Worker isolate lifetime. */
  private static instance: JulesService;

  public readonly env: Env;

  private constructor(env: Env) {
    this.env = env;
  }

  /**
   * Returns the singleton `JulesService` for the current request context.
   *
   * @param env - Cloudflare Worker environment bindings (must include `JULES_API_KEY` secret).
   */
  public static getInstance(env: Env): JulesService {
    if (!JulesService.instance) {
      JulesService.instance = new JulesService(env);
    }
    return JulesService.instance;
  }

  /**
   * Lazy-loads the Jules SDK client, injecting the API key from the Cloudflare
   * Secrets Store. Dynamic import is required because the SDK is a heavy
   * dependency that should not be loaded on every Worker startup.
   */
  public async getClient() {
    const logger = new Logger(this.env, "JulesService");
    const { jules } = await import("@google/jules-sdk");
    const apiKey = await this.env.JULES_API_KEY.get();
    if (!apiKey) {
      logger.warn("JULES_API_KEY is not set. Falling back to environment default.");
      return jules;
    }
    return jules.with({ apiKey });
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  async startSession(params: StartSessionParams) {
    return methods.startSession(this, params);
  }

  async startParallelSessions(paramsList: StartSessionParams[]) {
    return methods.startParallelSessions(this, paramsList);
  }

  async getSession(sessionId: string) {
    return methods.getSession(this, sessionId);
  }

  async getSessionInfo(sessionId: string) {
    return methods.getSessionInfo(this, sessionId);
  }

  async streamSession(sessionId: string) {
    return methods.streamSession(this, sessionId);
  }

  async runSession(prompt: string) {
    return methods.runSession(this, prompt);
  }

  async getSessionSnapshot(
    sessionId: string,
    options?: { format?: 'json' | 'markdown'; include?: string[]; exclude?: string[]; activities?: boolean }
  ) {
    return methods.getSessionSnapshot(this, sessionId, options);
  }

  async logStream(session: any, handlers: Record<string, (activity: any) => void>) {
    return methods.logStream(this, session, handlers);
  }

  async runRepolessSession(prompt: string): Promise<{ agentMessage?: string; files: Record<string, string> }> {
    return methods.runRepolessSession(this, prompt);
  }

  async runConcurrentSessions(tasks: string[], concurrency: number = 2) {
    return methods.runConcurrentSessions(this, tasks, concurrency);
  }

  async getSessionResult(sessionId: string) {
    return methods.getSessionResult(this, sessionId);
  }

  async collectSessionOutcome(sessionOrId: string | any) {
    return methods.collectSessionOutcome(this, sessionOrId);
  }

  async sendMessage(sessionId: string, message: string): Promise<void> {
    return methods.sendMessage(this, sessionId, message);
  }

  async waitForState(sessionId: string, state: string): Promise<unknown> {
    return methods.waitForState(this, sessionId, state);
  }

  async approveSession(sessionId: string): Promise<void> {
    return methods.approveSession(this, sessionId);
  }

  async reviseSessionPlan(sessionId: string, feedback: string): Promise<void> {
    return methods.reviseSessionPlan(this, sessionId, feedback);
  }

  async rejectSessionPlan(sessionId: string, feedback?: string): Promise<void> {
    return methods.rejectSessionPlan(this, sessionId, feedback);
  }

  async updateJobStatus(
    sessionId: string,
    status: "pending" | "blocked" | "completed" | "failed"
  ): Promise<void> {
    return methods.updateJobStatus(this, sessionId, status);
  }

  async executeMCPTool(toolName: string, args: Record<string, any>): Promise<any> {
    return methods.executeMCPTool(this, toolName, args);
  }

  async listSessions(agentId?: string, status?: string): Promise<any[]> {
    return methods.listSessions(this, agentId, status);
  }

  async getSessionState(sessionId: string): Promise<any> {
    return methods.getSessionState(this, sessionId);
  }

  async getCodeReviewContext(sessionId: string): Promise<any> {
    return methods.getCodeReviewContext(this, sessionId);
  }

  async getBashOutputs(sessionId: string): Promise<any> {
    return methods.getBashOutputs(this, sessionId);
  }

  async queryCache(query: string): Promise<any[]> {
    return methods.queryCache(this, query);
  }

  async healthProbe() {
    return methods.healthProbe(this);
  }
}
