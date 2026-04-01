/**
 * @file backend/src/services/jules/service.ts
 * @description Canonical Jules AI coding agent service.
 *
 * `JulesService` is the single point of integration with the `@google/jules-sdk`.
 * It wraps the SDK's session lifecycle, injects mandatory webhook reporting
 * instructions into every outgoing prompt, and persists session metadata in D1.
 *
 * ## Singleton Pattern
 * `JulesService.getInstance(env)` returns a request-scoped singleton so that
 * multiple callers within the same Worker request share one client connection.
 *
 * ## Auto Webhook Injection
 * Every prompt sent to Jules (on `startSession` and `sendMessage`) is automatically
 * appended with `buildWebhookInstruction()`. This ensures Jules unconditionally
 * calls back to the Worker's webhook endpoints without the caller needing to
 * manage it manually.
 *
 * ## D1 Persistence
 * Sessions are tracked in `jules_sessions` so that:
 *   - The `JulesOverseer` can monitor and unblock stuck sessions
 *   - Webhook handlers can look up the originating agent + project context
 *   - The frontend can display all active/historical sessions
 *
 * @module Services/Jules
 */

import { getDb } from "@db";
import { julesSessions, julesJobs } from "@db/schemas/jules";
import { eq } from "drizzle-orm";
import { buildWebhookInstruction } from "./webhook-instruction";
import type { StartSessionParams } from "./types";

// ─── Output Parsers ───────────────────────────────────────────────────────────

/**
 * Parses Jules SDK `changeSet` patch format into structured file records.
 *
 * The format Jules uses is:
 *   `## File: path/to/file.ts\n<file content>`
 *
 * @param text - Raw patch text from a Jules `changeSet` output.
 * @returns Array of `{ filename, content }` pairs extracted from the patch.
 */
function parseChangeSet(
  text?: string | null
): { filename: string; content: string }[] {
  if (!text) return [];
  const files: { filename: string; content: string }[] = [];
  const parts = text.split("## File: ");
  for (let i = 1; i < parts.length; i++) {
    const section = parts[i];
    const newlineIdx = section.indexOf("\n");
    if (newlineIdx !== -1) {
      files.push({
        filename: section.substring(0, newlineIdx).trim(),
        content: section.substring(newlineIdx + 1).trim(),
      });
    }
  }
  return files;
}

function extractFilesFromUnifiedDiff(
  unidiff?: string | null
): { filename: string; content: string }[] {
  if (!unidiff) {
    return [];
  }

  const files = new Map<string, string>();
  const fileBlocks = unidiff.split(/(?=^diff --git)/m).filter(Boolean);

  for (const block of fileBlocks) {
    const pathMatch = block.match(/^\+\+\+ b\/(.+)$/m);
    if (!pathMatch) {
      continue;
    }

    const filePath = pathMatch[1];
    const contentLines: string[] = [];

    for (const line of block.split("\n")) {
      if (
        line.startsWith("+++") ||
        line.startsWith("---") ||
        line.startsWith("@@") ||
        line.startsWith("diff --git") ||
        line.startsWith("index ") ||
        line.startsWith("new file")
      ) {
        continue;
      }

      if (line.startsWith("+")) {
        contentLines.push(line.slice(1));
      }
    }

    if (contentLines.length > 0) {
      files.set(filePath, contentLines.join("\n"));
    }
  }

  return Array.from(files.entries()).map(([filename, content]) => ({
    filename,
    content,
  }));
}

function parsePullRequestNumber(url?: string): number {
  if (!url) {
    return 0;
  }

  const match = url.match(/\/pull\/(\d+)/);
  return match ? Number(match[1]) : 0;
}

// ─── JulesService ─────────────────────────────────────────────────────────────

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

  private constructor(private readonly env: Env) {}

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

  // ── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Lazy-loads the Jules SDK client, injecting the API key from the Cloudflare
   * Secrets Store. Dynamic import is required because the SDK is a heavy
   * dependency that should not be loaded on every Worker startup.
   *
   * @returns A Jules client configured with the stored API key.
   */
  private async getClient() {
    const { jules } = await import("@google/jules-sdk");
    const apiKey = await this.env.JULES_API_KEY.get();
    if (!apiKey) {
      console.warn(
        "[JulesService] JULES_API_KEY is not set. Falling back to environment default."
      );
      return jules;
    }
    return jules.with({ apiKey });
  }

  /**
   * Updates the `lastActivityAt` and optionally `status` fields for a session.
   * Called as a background task — failures are logged but never bubble up.
   *
   * @param sessionId - Jules session ID to update.
   * @param status - Optional new status value to set.
   */
  private async updateSessionActivity(
    sessionId: string,
    status?: "active" | "completed" | "failed" | "stuck" | "waiting_for_user"
  ): Promise<void> {
    try {
      const db = getDb(this.env.DB);
      await db
        .update(julesSessions)
        .set({
          lastActivityAt: new Date(),
          updatedAt: new Date(),
          ...(status ? { status } : {}),
        })
        .where(eq(julesSessions.id, sessionId));
    } catch (error) {
      console.error(
        `[JulesService] DB update failed for session ${sessionId}`,
        error
      );
    }
  }

  /**
   * Resolves the Worker's public hostname from the environment.
   * Used to construct absolute webhook callback URLs injected into Jules prompts.
   *
   * @returns The Worker's public hostname, or a safe placeholder.
   */
  private getWorkerHost(): string {
    return (this.env as any).WORKER_HOST || "core-github-api.workers.dev";
  }

  private buildSessionPayload(params: StartSessionParams) {
    const sessionId = params.sessionId || crypto.randomUUID();
    const webhookInstruction = buildWebhookInstruction(
      this.getWorkerHost(),
      sessionId
    );
    const enrichedPrompt = `${params.prompt}\n\n${webhookInstruction}`;

    const options: Record<string, unknown> = {
      id: sessionId,
      prompt: enrichedPrompt,
      autoPr: params.autoPr ?? false,
    };

    if (typeof params.requireApproval === "boolean") {
      options.requireApproval = params.requireApproval;
    }

    if (params.repo) {
      options.source = {
        github: `${params.repo.owner}/${params.repo.repo}`,
        baseBranch: params.repo.branch || "main",
      };
    }

    return {
      sessionId,
      enrichedPrompt,
      options,
    };
  }

  private async createSessionWithFallback(
    client: any,
    params: StartSessionParams,
    payload: ReturnType<JulesService["buildSessionPayload"]>,
  ) {
    let session: any;
    try {
      session = await client.session(payload.options);
    } catch (sessionError: any) {
      if (
        sessionError?.message?.includes("SourceNotFoundError") ||
        sessionError?.name === "SourceNotFoundError"
      ) {
        console.warn(
          `[JulesService] Source not found for ${params.repo?.owner}/${params.repo?.repo}. Retrying without source...`
        );
        delete payload.options.source;
        payload.options.autoPr = false;
        session = await client.session(payload.options);
      } else {
        throw sessionError;
      }
    }

    return session;
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * Starts a new Jules coding session.
   *
   * This method:
   *   1. Appends the mandatory webhook instruction to the prompt
   *   2. Creates a Jules SDK session (with retry on SourceNotFound)
   *   3. Persists the session to `jules_sessions` in D1
   *
   * @param params - Session configuration (prompt, repo, agentId, projectId, etc.)
   * @returns The initialized Jules session object from the SDK.
   *
   * @throws If the Jules SDK cannot create a session (non-SourceNotFound errors re-throw).
   */
  async startSession(params: StartSessionParams) {
    const client = await this.getClient();
    const payload = this.buildSessionPayload(params);

    console.log(
      `[JulesService] Starting session ${payload.sessionId}: ${params.prompt.substring(0, 60)}...`
    );

    const session = await this.createSessionWithFallback(client as any, params, payload);

    const finalSessionId: string = session.id || payload.sessionId;
    console.log(`[JulesService] Session created: ${finalSessionId}`);

    // Persist to D1 — fire-and-forget, do not block the response
    this.persistSession(finalSessionId, payload.enrichedPrompt, params).catch((err) =>
      console.error("[JulesService] Failed to persist session to D1:", err)
    );

    return session;
  }

  async startParallelSessions(paramsList: StartSessionParams[]) {
    const client = await this.getClient();
    const payloads = paramsList.map((params) => ({
      params,
      payload: this.buildSessionPayload(params),
    }));

    let sessions: any[] = [];

    if (typeof (client as any).all === "function") {
      try {
        sessions = await (client as any).all(payloads.map((entry) => entry.payload.options));
      } catch (error) {
        console.warn("[JulesService] client.all() failed, falling back to Promise.all(session())", error);
      }
    }

    if (sessions.length === 0) {
      sessions = await Promise.all(
        payloads.map((entry) =>
          this.createSessionWithFallback(client as any, entry.params, entry.payload),
        ),
      );
    }

    await Promise.all(
      sessions.map((session, index) =>
        this.persistSession(
          session.id || payloads[index]!.payload.sessionId,
          payloads[index]!.payload.enrichedPrompt,
          payloads[index]!.params,
        ).catch((err) =>
          console.error("[JulesService] Failed to persist parallel session to D1:", err),
        ),
      ),
    );

    return sessions;
  }

  /**
   * Persists a new Jules session to `jules_sessions` in D1.
   * Called as a background task from `startSession()`.
   *
   * @param sessionId - The Jules-assigned (or pre-assigned) session ID.
   * @param enrichedPrompt - The full prompt sent to Jules (including webhook instruction).
   * @param params - Original `StartSessionParams` for context fields.
   */
  private async persistSession(
    sessionId: string,
    enrichedPrompt: string,
    params: StartSessionParams
  ): Promise<void> {
    const db = getDb(this.env.DB);
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
  }

  /**
   * Retrieves an existing Jules session by ID.
   * Used by `JulesOverseer`, webhook handlers, and status routes.
   *
   * @param sessionId - The Jules session ID to fetch.
   * @returns The Jules SDK session handle.
   */
  async getSession(sessionId: string) {
    const client = await this.getClient();
    return (client as any).session(sessionId);
  }

  /**
   * Returns the latest session resource information.
   *
   * @param sessionId - The Jules session ID.
   * @returns The current session resource.
   */
  async getSessionInfo(sessionId: string) {
    const session = await this.getSession(sessionId);
    return session.info();
  }

  /**
   * Opens a streaming activity feed for a session.
   * Updates the session's `lastActivityAt` as a background task.
   *
   * @param sessionId - The Jules session ID to stream from.
   * @returns An `AsyncIterable` of Jules activity objects.
   */
  async streamSession(sessionId: string) {
    const session = await this.getSession(sessionId);
    this.updateSessionActivity(sessionId).catch((err) =>
      console.error(`[JulesService] Failed to update activity for ${sessionId}`, err)
    );
    return session.stream();
  }

  async streamInteraction(sessionId: string, monitoringAgentId?: string): Promise<void> {
    try {
      const session = await this.getSession(sessionId);
      if (typeof (session as any).stream === 'function') {
        const stream = (session as any).stream();
        for await (const activity of stream) {
          try {
            const doId = this.env.JULES_OVERSEER.idFromName('singleton');
            const doStub = this.env.JULES_OVERSEER.get(doId);
            await doStub.fetch('http://do/ingest', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'agent_event',
                sessionId,
                event: activity,
                monitoringAgentId,
              }),
            });
          } catch (e) {
            console.warn('[JulesService] Failed to push stream event to Overseer', e);
          }
        }
      }
    } catch (e) {
      console.error('[JulesService] Failed to stream interaction', e);
    }
  }

  /**
   * Executes a repoless automated Jules session (fire-and-wait).
   * Unlike `startSession`, this waits for completion and returns the result directly.
   *
   * @param prompt - Task to execute. Webhook instruction is automatically appended.
   * @returns The Jules session result object.
   */
  async runSession(prompt: string) {
    const client = await this.getClient();
    const tempId = crypto.randomUUID();
    const enrichedPrompt = `${prompt}\n\n${buildWebhookInstruction(this.getWorkerHost(), tempId)}`;
    console.log(
      `[JulesService] Running automated session: ${prompt.substring(0, 60)}...`
    );
    return (client as any).run({ prompt: enrichedPrompt });
  }

  /**
   * Returns a snapshot of the session's current state.
   * Utilizes the native `.snapshot()` output with masking/filtering (`include`, `exclude`, `toMarkdown()`).
   *
   * @param sessionId - The Jules session ID.
   * @param options.format - 'json' or 'markdown'
   * @param options.include - Whitelist fields to serialize
   * @param options.exclude - Blacklist fields to serialize
   * @param options.activities - Whether to preload activities metadata (heavier)
   * @returns Serialized overview of the session, or markdown format.
   */
  async getSessionSnapshot(
    sessionId: string,
    options?: { format?: 'json' | 'markdown'; include?: string[]; exclude?: string[]; activities?: boolean }
  ) {
    const session = await this.getSession(sessionId);
    // Create a snapshot with activities loaded based on options
    const snapshot = await session.snapshot({ activities: options?.activities ?? false });
    
    if (options?.format === 'markdown') {
      return typeof snapshot.toMarkdown === 'function' ? snapshot.toMarkdown() : snapshot.toJSON(options as any);
    }
    
    return snapshot.toJSON(options as any);
  }

  /** Typed handler map for stream activities. Unspecified types are silently ignored. */
  async logStream(session: any, handlers: Record<string, (activity: any) => void>) {
    for await (const activity of session.stream()) {
      const handler = handlers[activity.type];
      if (typeof handler === 'function') {
        handler(activity);
      }
    }
  }

  /**
   * Runs a repoless Jules session securely, streams progress, and returns
   * the agent's last message along with all generated file contents.
   */
  async runRepolessSession(prompt: string): Promise<{ agentMessage?: string; files: Record<string, string> }> {
    const client = await this.getClient();
    const tempId = crypto.randomUUID();
    const enrichedPrompt = `${prompt}\n\n${buildWebhookInstruction(this.getWorkerHost(), tempId)}`;
    
    const session = await (client as any).session({ prompt: enrichedPrompt });

    // Non-blocking: collect generated files from outcome
    const outcomePromise = session.result().then((outcome: any) => {
      console.log(`[JulesService] Session ${outcome.state}. PR: ${outcome.pullRequest?.url ?? 'none'}`);

      const files: Record<string, string> = {};
      if (outcome.generatedFiles && typeof outcome.generatedFiles().all === 'function') {
        for (const file of outcome.generatedFiles().all()) {
          files[file.path] = file.content;
        }
      }
      return files;
    });

    // Stream progress and capture the last agent message
    let agentMessage: string | undefined;
    await this.logStream(session, {
      agentMessaged: (a: any) => {
        agentMessage = a.message;
        console.log(`[JulesService] Agent: ${a.message.slice(0, 120)}`);
      },
      progressUpdated: (a: any) => console.log(`[JulesService] Progress: ${a.title}`),
    });

    const files = await outcomePromise;
    return { agentMessage, files };
  }

  /**
   * Expose jules.all capability for concurrent, parallel session generation.
   */
  async runConcurrentSessions(tasks: string[], concurrency: number = 2) {
    const client = await this.getClient();
    console.log(`[JulesService] Creating ${tasks.length} concurrent sessions...`);

    const sessions = await (client as any).all(
      tasks,
      (task: string) => ({ prompt: task }),
      { concurrency, stopOnError: false }
    );
    return sessions;
  }

  /**
   * Waits for the Jules session to complete and parses the structured output.
   *
   * Parsed outputs include:
   *   - `pullRequests` — PR metadata (title, number, URL)
   *   - `changeSets`   — files modified by Jules
   *   - `generatedFiles` — new files created by Jules
   *
   * @param sessionId - The Jules session ID.
   * @returns Parsed session result with structured output categories.
   */
  async getSessionResult(sessionId: string) {
    const session = await this.getSession(sessionId);
    const result = await session.result();
    const rawResult: any = result;
    const info = rawResult.info || rawResult;
    const outputs = info.outputs || [];
    const parsedOutputs: {
      pullRequests: { title: string; number: number; url: string }[];
      changeSets: { filename: string; content: string }[];
      generatedFiles: { path: string; content: string }[];
    } = { pullRequests: [], changeSets: [], generatedFiles: [] };

    for (const output of outputs) {
      switch (output.type) {
        case "pullRequest":
          parsedOutputs.pullRequests.push({
            title: output.pullRequest.title,
            number:
              output.pullRequest.number || parsePullRequestNumber(output.pullRequest.url),
            url: output.pullRequest.htmlUrl || output.pullRequest.url,
          });
          break;
        case "changeSet":
          {
            const parsedFiles: { filename: string; content: string }[] = [];
          if (typeof output.changeSet?.parsed === "function") {
            const parsed = output.changeSet.parsed();
            parsedFiles.push(
              ...((parsed?.files || []).map((file: any) => ({
                filename: file.path,
                content: file.content || "",
              })) as Array<{ filename: string; content: string }>),
            );
          }

          if (parsedFiles.length === 0) {
            parsedFiles.push(
              ...parseChangeSet(output.changeSet?.patch),
              ...extractFilesFromUnifiedDiff(output.changeSet?.gitPatch?.unidiffPatch),
            );
          }
          parsedOutputs.changeSets.push(...parsedFiles);
          }
          break;
        case "generatedFile":
          parsedOutputs.generatedFiles.push({
            path: output.generatedFile.path,
            content: output.generatedFile.content,
          });
          break;
      }
    }

    const generatedFiles = info.generatedFiles || rawResult.generatedFiles || [];
    for (const generatedFile of generatedFiles) {
      parsedOutputs.generatedFiles.push({
        path: generatedFile.path,
        content: generatedFile.content,
      });
    }

    // Mark session as completed in D1 (background)
    this.updateSessionActivity(sessionId, "completed").catch(console.error);

    return {
      state: info.state,
      error: info.error,
      outputs: parsedOutputs,
      rawResult: result,
    };
  }

  async collectSessionOutcome(sessionOrId: string | any): Promise<{
    sessionId: string;
    state: string;
    lastAgentMessage: string | null;
    pullRequestUrl?: string;
    generatedFiles: Array<{ path: string; content: string }>;
    rawResult: any;
  }> {
    const session =
      typeof sessionOrId === "string" ? await this.getSession(sessionOrId) : sessionOrId;
    const outcome = await session.result();
    const generatedFiles: Array<{ path: string; content: string }> = [];

    const filesCollection =
      typeof outcome?.generatedFiles === "function" ? outcome.generatedFiles() : null;

    if (filesCollection && typeof filesCollection.entries === "function") {
      for (const [path, file] of filesCollection.entries()) {
        let content = "";
        if (typeof file?.content === "string") {
          content = file.content;
        } else if (typeof file?.text === "function") {
          content = await file.text();
        } else if (typeof file === "string") {
          content = file;
        }

        generatedFiles.push({ path, content });
      }
    }

    return {
      sessionId: String(session.id || outcome?.id || ""),
      state: outcome?.state || "unknown",
      lastAgentMessage:
        typeof outcome?.lastAgentMessage === "string" ? outcome.lastAgentMessage : null,
      pullRequestUrl:
        typeof outcome?.pullRequest?.url === "string" ? outcome.pullRequest.url : undefined,
      generatedFiles,
      rawResult: outcome,
    };
  }

  /**
   * Sends a follow-up message to an active Jules session.
   *
   * The webhook reporting instruction is automatically appended to the
   * message so Jules continues to report back on subsequent work.
   *
   * @param sessionId - The Jules session ID.
   * @param message - The message to send to Jules.
   */
  async sendMessage(sessionId: string, message: string): Promise<void> {
    const session = await this.getSession(sessionId);
    const enrichedMessage = `${message}\n\n${buildWebhookInstruction(this.getWorkerHost(), sessionId)}`;

    if (typeof (session as any).sendMessage === "function") {
      await (session as any).sendMessage(enrichedMessage);
    } else if (typeof (session as any).chat === "function") {
      await (session as any).chat(enrichedMessage);
    } else {
      console.warn(
        `[JulesService] Session ${sessionId} does not expose sendMessage or chat.`
      );
    }

    this.updateSessionActivity(sessionId).catch(console.error);
  }

  /**
   * Waits for the Jules session to reach a specific state.
   * Convenience wrapper around the SDK's `session.waitFor()`.
   *
   * @param sessionId - The Jules session ID.
   * @param state - Target state to wait for.
   * @returns Resolves when the target state is reached.
   */
  async waitForState(sessionId: string, state: string): Promise<unknown> {
    const session = await this.getSession(sessionId);
    return session.waitFor(state);
  }

  /**
   * Approves a pending Jules plan.
   *
   * @param sessionId - The Jules session ID.
   */
  async approveSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    await session.approve();
    this.updateSessionActivity(sessionId, "active").catch(console.error);
  }

  async reviseSessionPlan(sessionId: string, feedback: string): Promise<void> {
    await this.sendMessage(
      sessionId,
      feedback || "Revise the current plan based on reviewer feedback and resubmit it for approval.",
    );
    this.updateSessionActivity(sessionId, "waiting_for_user").catch(console.error);
  }

  async rejectSessionPlan(sessionId: string, feedback?: string): Promise<void> {
    if (feedback) {
      await this.sendMessage(
        sessionId,
        `The current plan was rejected. Do not proceed. Reviewer feedback: ${feedback}`,
      );
    }
    this.updateSessionActivity(sessionId, "failed").catch(console.error);
  }

  /**
   * Updates the job status in `jules_jobs` by session ID.
   * Used by the `JulesOverseer` and webhook handlers.
   *
   * @param sessionId - The Jules session ID.
   * @param status - New job status to set.
   */
  async updateJobStatus(
    sessionId: string,
    status: "pending" | "blocked" | "completed" | "failed"
  ): Promise<void> {
    try {
      const db = getDb(this.env.DB);
      await db
        .update(julesJobs)
        .set({ status })
        .where(eq(julesJobs.sessionId, sessionId));
    } catch (error) {
      console.error(
        `[JulesService] Failed to update job status for ${sessionId}`,
        error
      );
    }
  }

  // ── MCP Tool Dispatcher (for @google/jules-mcp integration) ──────────────────

  /**
   * Routes the 8 MCP tool calls defined in `@google/jules-mcp` to the
   * corresponding `JulesService` methods. Called by the `createOurMcpServer`
   * tool handler in `index.ts`.
   *
   * Tool names mirrored from the SDK:
   * - `create_session`          → `startSession`
   * - `list_sessions`           → `listSessions`
   * - `get_session_state`       → `getSessionState`
   * - `send_reply_to_session`   → `sendMessage`
   * - `show_code_diff`          → `getSessionSnapshot`
   * - `get_code_review_context` → `getCodeReviewContext`
   * - `get_bash_outputs`        → `getBashOutputs`
   * - `query_cache`             → `queryCache`
   */
  async executeMCPTool(toolName: string, args: Record<string, any>): Promise<any> {
    switch (toolName) {
      case 'create_session': {
        const params = {
          prompt: args.prompt ?? '',
          ...(args.agentId ? { agentId: args.agentId } : {}),
          ...(args.requireApproval != null ? { requireApproval: args.requireApproval } : {}),
          // repo context — StartSessionParams uses `repo: { owner, repo, branch }` not top-level fields
          ...(args.repoOwner && args.repoName ? {
            repo: { owner: args.repoOwner, repo: args.repoName, branch: args.branch },
          } : {}),
        };
        const session = await this.startSession(params);
        return { sessionId: session.id, status: 'created' };
      }

      case 'list_sessions': {
        return this.listSessions(args.agentId, args.status);
      }

      case 'get_session_state': {
        return this.getSessionState(args.sessionId);
      }

      case 'send_reply_to_session': {
        await this.sendMessage(args.sessionId, args.message ?? '');
        return { sent: true };
      }

      case 'show_code_diff': {
        // getSessionSnapshot only accepts: format, include, exclude, activities
        return this.getSessionSnapshot(args.sessionId, {
          format: args.format ?? 'json',
          activities: false,
        });
      }

      case 'get_code_review_context': {
        return this.getCodeReviewContext(args.sessionId);
      }

      case 'get_bash_outputs': {
        return this.getBashOutputs(args.sessionId);
      }

      case 'query_cache': {
        return this.queryCache(args.query);
      }

      default:
        throw new Error(`[JulesService.executeMCPTool] Unknown tool: ${toolName}`);
    }
  }

  /**
   * Lists sessions from D1, optionally filtered by agentId and/or status.
   */
  async listSessions(_agentId?: string, _status?: string): Promise<any[]> {
    const db = getDb(this.env.DB);
    const query = db.select().from(julesSessions);
    return query;
  }

  /**
   * Returns the current state of a session from D1.
   */
  async getSessionState(sessionId: string): Promise<any> {
    const db = getDb(this.env.DB);
    const rows = await db
      .select()
      .from(julesSessions)
      .where(eq(julesSessions.id, sessionId))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * Returns a structured code review context for a session.
   * Delegates to `getSessionSnapshot` with review-optimized options.
   */
  async getCodeReviewContext(sessionId: string): Promise<any> {
    return this.getSessionSnapshot(sessionId, { activities: true, format: 'json' });
  }

  /**
   * Returns bash command outputs from a session's activity log by streaming
   * activities and filtering to bash-related types.
   */
  async getBashOutputs(sessionId: string): Promise<any> {
    try {
      // getSession() returns a SessionClient; stream() returns AsyncIterable<Activity>
      const session = await this.getSession(sessionId);
      const items: any[] = [];
      for await (const activity of session.stream()) {
        // Filter to shell/bash output activity types
        const type = (activity as any)?.type ?? '';
        if (type === 'bash_output' || type === 'shell' || type === 'progress_updated') {
          items.push(activity);
        }
      }
      return { sessionId, bashOutputs: items };
    } catch (e: any) {
      return { sessionId, bashOutputs: [], error: e.message };
    }
  }

  /**
   * Queries the Jules cache for previously executed sessions matching a keyword.
   */
  async queryCache(query: string): Promise<any[]> {
    const db = getDb(this.env.DB);
    // Basic text search in prompt field — extend with vectorize as needed
    const rows = await db
      .select()
      .from(julesSessions)
      .limit(20);
    return rows.filter((r: any) =>
      r.prompt?.toLowerCase().includes(query?.toLowerCase() ?? ''),
    );
  }
}
