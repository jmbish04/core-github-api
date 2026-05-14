/**
 * @file backend/src/routes/api/jules/index.ts
 * @description Consolidated Jules AI coding agent REST API.
 *
 * This router is the single canonical HTTP entrypoint for all Jules
 * session management operations. It replaces the previous ad-hoc route
 * at `routes/api/agents/jules.ts`.
 *
 * Mount point: `/api/jules` (registered in `backend/src/index.ts`)
 *
 * Endpoints:
 *   POST /start         — Start a new Jules coding session
 *   POST /invoke        — Alias for /start (backward compat)
 *   GET  /status/:id    — Get session status or snapshot
 *   GET  /stream/:id    — SSE stream of session activities
 *   GET  /history       — List past Jules sessions (with optional projectId filter)
 *   GET  /history/:id   — Full detail for one Jules session including webhook events
 *   GET  /search        — Full-text search across past Jules prompts
 *
 * @module Routes/Jules
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { streamText } from "hono/streaming";
import { getAgentByName } from 'agents';
import { JulesService } from "@/services/jules/service";
import { getDb } from "@db";
import { julesSessions, julesJobs, julesWebhookEvents } from "@db/schemas/jules";
import { eq, desc, like, and } from "drizzle-orm";
import { generateUuid } from "@/utils/common";
import { buildCodingAgentInstructions } from "@/services/golden-path-config";

// --- Modular Example Routes ---
import simpleApi from "./simple";
import advancedApi from "./advanced";
import agentApi from "./agent";
import stitchContextApi from "./stitch";
import customMcpServerApi from "./custom-mcp-server";
import mcpPlanGenApi from "./mcp-plan-generation";
import googleDocsApi from "./google-docs";
import googleSheetsApi from "./google-sheets";
import mergeApi from "./merge";
import customCliApi from "./custom-cli";
import resolveConflictsApi from "./resolve-conflicts";
import categoriesApi from "./categories";

const app = new Hono<{ Bindings: Env }>();

// Mount the modular Jules Examples
app.route("/examples/simple", simpleApi);
app.route("/examples/advanced", advancedApi);
app.route("/examples/agent", agentApi);
app.route("/examples/stitch", stitchContextApi);
app.route("/examples/custom-mcp", customMcpServerApi);
app.route("/examples/mcp-plan", mcpPlanGenApi);
app.route("/examples/google-docs", googleDocsApi);
app.route("/examples/google-sheets", googleSheetsApi);
app.route("/examples/merge", mergeApi);
app.route("/examples/custom-cli", customCliApi);
app.route("/resolve-conflicts", resolveConflictsApi);
app.route("/categories", categoriesApi);


// ─── Zod Schemas ──────────────────────────────────────────────────────────────

/**
 * Validates the request body for starting a new Jules session.
 */
const startSessionSchema = z.object({
  /** The coding task or description for Jules to execute. */
  prompt: z.string().min(1, "prompt is required"),

  /** Optional GitHub repository URL in https://github.com/owner/repo format. */
  repoUrl: z.string().optional(),

  /** If true, Jules will automatically open a Pull Request on completion. */
  autoPr: z.boolean().default(false),

  /**
   * Session execution mode:
   * - "session": Interactive session (default) — supports streaming and messages
   * - "run": Fire-and-wait one-shot execution (no repo required)
   */
  mode: z.enum(["session", "run"]).default("session"),

  /** If true, triggers the JulesOverseer to monitor this session. */
  force_overseer: z.boolean().default(false),

  /** Optional pre-assigned session ID. Jules uses this ID if provided. */
  session_id: z.string().optional(),

  /** If true, coding-agent golden-path standards are appended to the prompt (default: true). */
  inject_standards: z.boolean().default(true),

  /** Originating agent Durable Object ID for webhook routing. */
  agent_id: z.string().optional(),

  /** Originating specialist class name for webhook routing. */
  specialist_class: z.string().optional(),

  /** Project ID for cross-session memory association. */
  project_id: z.string().optional(),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/jules/start
 *
 * Creates a new Jules coding session. The prompt is automatically enriched with:
 *   1. Coding-agent golden path standards (if inject_standards: true)
 *   2. Mandatory webhook reporting instructions (always)
 *
 * Returns the session ID, job ID (if repo provided), and initial status.
 */
app.post("/start", zValidator("json", startSessionSchema), async (c) => {
  const {
    prompt,
    repoUrl,
    autoPr,
    mode,
    force_overseer,
    session_id,
    inject_standards,
    agent_id,
    specialist_class,
    project_id,
  } = c.req.valid("json");

  const julesService = JulesService.getInstance(c.env);
  const db = getDb(c.env.DB);
  const standards = inject_standards
    ? await buildCodingAgentInstructions(c.env)
    : "";
  const enrichedPrompt = inject_standards
    ? `${prompt}\n\n${standards}`
    : prompt;
  const sessionId = session_id || generateUuid();

  // Fire-and-wait (repoless)
  if (mode === "run") {
    try {
      const result = await julesService.runSession(enrichedPrompt);
      return c.json({ success: true, mode: "run", result });
    } catch (error: any) {
      return c.json({ success: false, mode: "run", error: error.message }, 500);
    }
  }

  // Parse GitHub repo from URL
  let repo: { owner: string; repo: string; branch?: string } | undefined;
  if (repoUrl) {
    const clean = repoUrl.replace("https://github.com/", "").replace(/\.git$/, "");
    const parts = clean.split("/");
    if (parts.length >= 2) {
      let branch: string | undefined;
      if (parts.length >= 4 && (parts[2] === "tree" || parts[2] === "blob")) {
        branch = parts.slice(3).join("/");
      }
      repo = { owner: parts[0], repo: parts[1], ...(branch ? { branch } : {}) };
    }
  }

  // Persist job record if we have a repo
  let jobId: number | undefined;
  if (repo) {
    try {
      const [job] = await db
        .insert(julesJobs)
        .values({
          sessionId,
          repoFullName: `${repo.owner}/${repo.repo}`,
          prompt: enrichedPrompt,
          status: "pending",
        })
        .returning();
      jobId = job?.id;
    } catch (e) {
      console.warn("[JulesAPI] Failed to create job record:", e);
    }
  }

  try {
    const session = await julesService.startSession({
      prompt: enrichedPrompt,
      repo,
      autoPr,
      sessionId,
      agentId: agent_id,
      specialistClass: specialist_class,
      projectId: project_id,
    });

    // Sync job sessionId if Jules assigned a different ID
    if (jobId && session.id !== sessionId) {
      await db
        .update(julesJobs)
        .set({ sessionId: session.id })
        .where(eq(julesJobs.id, jobId));
    }

    // Optionally start JulesOverseer monitoring
    if (force_overseer) {
      const agent = await getAgentByName(c.env.ORCHESTRATOR_AGENT as any, "jules-overseer-singleton");
      c.executionCtx.waitUntil((agent as any).checkSchedule());
    }

    let status = "connecting";
    try {
      status = await session.info().then((i: any) => i.state);
    } catch(error: any) {
      console.error("[JulesAPI] Failed to get session info:", JSON.stringify(error));
    }

    return c.json({
      success: true,
      mode: "session",
      sessionId: session.id,
      jobId,
      status,
    });
  } catch (error: any) {
    return c.json({ success: false, mode: "session", error: error.message }, 500);
  }
});

/** POST /api/jules/invoke — Backward compat alias for /start */
app.post("/invoke", zValidator("json", startSessionSchema), async (c) => {
  return app.request("/start", c.req.raw, c.env, c.executionCtx);
});

/**
 * GET /api/jules/status/:sessionId
 *
 * Returns the current Jules session status.
 * Add ?snapshot=true to include the full session snapshot.
 */
app.get("/status/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  const wantsSnapshot = c.req.query("snapshot") === "true";
  const julesService = JulesService.getInstance(c.env);

  try {
    if (wantsSnapshot) {
      const snapshot = await julesService.getSessionSnapshot(sessionId);
      return c.json({ success: true, isSnapshot: true, snapshot });
    }
    const session = await julesService.getSession(sessionId);
    const info = await session.info();
    return c.json({ success: true, info });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * GET /api/jules/stream/:sessionId
 *
 * Opens a Server-Sent Events (SSE) stream for a Jules session.
 * Each activity from Jules is emitted as a JSON-encoded SSE event.
 */
app.get("/stream/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  const julesService = JulesService.getInstance(c.env);

  return streamText(c as any, async (stream) => {
    try {
      const activityStream = await julesService.streamSession(sessionId);
      await stream.write(JSON.stringify({ event: "connected", sessionId }) + "\n\n");

      for await (const activity of activityStream) {
        await stream.write(JSON.stringify({ event: "activity", data: activity }) + "\n\n");
        if (activity.type === "sessionCompleted" || activity.type === "sessionFailed") {
          const result = await julesService.getSessionResult(sessionId);
          await stream.write(JSON.stringify({ event: "result", data: result }) + "\n\n");
          break;
        }
      }
    } catch (error: any) {
      await stream.write(JSON.stringify({ event: "error", error: error.message }) + "\n\n");
    }
  });
});

/**
 * GET /api/jules/history
 *
 * Lists past Jules sessions, optionally filtered by project.
 * Query parameters:
 *   - projectId?: Filter to a specific project
 *   - limit?: Max results (default 20, max 100)
 *   - page?: Pagination offset (default 0)
 */
app.get("/history", async (c) => {
  const projectId = c.req.query("projectId");
  const limit = Math.min(parseInt(c.req.query("limit") || "20"), 100);
  const page = parseInt(c.req.query("page") || "0");
  const db = getDb(c.env.DB);
  const julesService = JulesService.getInstance(c.env);

  try {
    let sdkSessions: any[] = [];
    try {
      const jules = await julesService.getClient();
      // Fetch more if paginating, then we'll slice
      const res = await (jules.sessions({ limit: limit * (page + 1) }) as any);
      sdkSessions = res.sessions || [];
    } catch (sdkError) {
      console.error("[JulesAPI] Failed to fetch sessions from SDK:", sdkError);
    }

    let d1Sessions: any[] = [];
    try {
      const query = db
        .select()
        .from(julesSessions)
        .orderBy(desc(julesSessions.createdAt))
        .limit(limit)
        .offset(page * limit);

      d1Sessions = projectId
        ? await query.where(eq(julesSessions.projectId, projectId))
        : await query;
    } catch (d1Error) {
      console.error("[JulesAPI] Failed to fetch sessions from D1:", d1Error);
    }

    // Merge them
    const mergedMap = new Map<string, any>();

    // Seed with SDK sessions
    for (const s of sdkSessions) {
      let repoName = undefined;
      if (s.sourceContext?.source) {
         repoName = s.sourceContext.source.replace('sources/github/', '');
      }
      let sdkStatus = s.state;
      if (sdkStatus === 'inProgress') sdkStatus = 'active';
      if (sdkStatus === 'awaitingPlanApproval' || sdkStatus === 'awaitingUserFeedback') sdkStatus = 'waiting_for_user';

      mergedMap.set(s.id, {
        id: s.id,
        status: sdkStatus,
        prompt: s.prompt || s.title || "Untitled Session",
        createdAt: s.createTime,
        repoName,
      });
    }

    // Merge D1 metadata
    for (const d of d1Sessions) {
      // D1 createdAt is a Date object (Drizzle timestamp mode) — normalize to ISO
      const d1CreatedAt = d.createdAt instanceof Date ? d.createdAt.toISOString() : d.createdAt;
      const d1Repo = d.repoOwner && d.repoName ? `${d.repoOwner}/${d.repoName}` : d.repoName;

      if (mergedMap.has(d.id)) {
        const existing = mergedMap.get(d.id);
        existing.projectId = d.projectId || existing.projectId;
        existing.repoName = d1Repo || existing.repoName;
        // D1 prompt is often the original full prompt
        if (d.prompt) existing.prompt = d.prompt;
      } else {
        mergedMap.set(d.id, {
          id: d.id,
          status: d.status,
          prompt: d.prompt,
          createdAt: d1CreatedAt,
          repoName: d1Repo,
          projectId: d.projectId,
        });
      }
    }

    let finalSessions = Array.from(mergedMap.values());
    
    // Sort by createdAt desc — handle both ISO strings and epoch-second integers
    const toMs = (v: any): number => {
      if (!v) return 0;
      if (v instanceof Date) return v.getTime();
      if (typeof v === 'number') return v < 1e12 ? v * 1000 : v; // epoch seconds vs ms
      return new Date(v).getTime() || 0;
    };
    finalSessions.sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
    
    // Filter by projectId if requested
    if (projectId) {
      finalSessions = finalSessions.filter(s => s.projectId === projectId);
    }

    // Apply offset/limit
    finalSessions = finalSessions.slice(page * limit, (page + 1) * limit);

    return c.json({ success: true, sessions: finalSessions, page, limit });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * GET /api/jules/history/:sessionId
 *
 * Returns full details for a single Jules session including all
 * webhook events received from Jules for that session.
 */
app.get("/history/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  const db = getDb(c.env.DB);
  const julesService = JulesService.getInstance(c.env);

  try {
    let sdkSession: any = null;
    let sdkEvents: any[] = [];
    try {
      const snapshot = await julesService.getSessionSnapshot(sessionId, { activities: true, format: 'json' });
      if (snapshot) {
        sdkSession = snapshot;
        sdkEvents = snapshot.activities || [];
      }
    } catch (sdkError) {
      console.error(`[JulesAPI] Failed to fetch session snapshot for ${sessionId}:`, sdkError);
    }

    let d1Session: any = null;
    let d1Events: any[] = [];
    try {
      const [session] = await db
        .select()
        .from(julesSessions)
        .where(eq(julesSessions.id, sessionId))
        .limit(1);
      
      d1Session = session;

      d1Events = await db
        .select()
        .from(julesWebhookEvents)
        .where(eq(julesWebhookEvents.julesSessionId, sessionId))
        .orderBy(desc(julesWebhookEvents.createdAt));
    } catch (d1Error) {
      console.error(`[JulesAPI] Failed to fetch D1 data for ${sessionId}:`, d1Error);
    }

    if (!sdkSession && !d1Session) {
      return c.json({ success: false, error: "Session not found" }, 404);
    }

    let sdkStatus = sdkSession?.state;
    if (sdkStatus === 'inProgress') sdkStatus = 'active';
    if (sdkStatus === 'awaitingPlanApproval' || sdkStatus === 'awaitingUserFeedback') sdkStatus = 'waiting_for_user';

    const d1CreatedAt = d1Session?.createdAt instanceof Date ? d1Session.createdAt.toISOString() : d1Session?.createdAt;
    const d1Repo = d1Session?.repoOwner && d1Session?.repoName ? `${d1Session.repoOwner}/${d1Session.repoName}` : d1Session?.repoName;

    const mergedSession = {
      id: sessionId,
      status: sdkStatus || d1Session?.status || 'unknown',
      prompt: sdkSession?.prompt || sdkSession?.title || d1Session?.prompt || "Untitled Session",
      title: sdkSession?.title || d1Session?.prompt?.slice(0, 80) || "Untitled",
      createdAt: sdkSession?.createTime || d1CreatedAt,
      projectId: d1Session?.projectId,
      repoName: (sdkSession?.sourceContext?.source || '').replace('sources/github/', '') || d1Repo,
      // SDK snapshot fields
      progress_pct: sdkSession?.progress_pct,
      current_step_name: sdkSession?.current_step_name,
      plan_steps: sdkSession?.plan_steps,
      summary: sdkSession?.summary,
      waiting_reason: sdkSession?.waiting_reason,
      error_message: sdkSession?.error_message,
    };

    // Merge events (avoiding exact duplicates might be hard, but we can just combine them)
    // D1 events have createdAt, eventType, message
    // SDK events have createTime, type, summary
    const mergedEventsMap = new Map<string, any>();

    for (const e of sdkEvents) {
      mergedEventsMap.set(e.id || e.name || Math.random().toString(), {
        id: e.id,
        createdAt: e.createTime,
        eventType: e.type,
        message: e.summary || e.message || e.type,
      });
    }

    for (const e of d1Events) {
      const d1EventTime = e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt;
      mergedEventsMap.set(e.id, {
        id: e.id,
        createdAt: d1EventTime,
        eventType: e.eventType,
        message: e.message || e.eventType,
        progressPct: e.progressPct,
        stepName: e.stepName,
      });
    }

    const finalEvents = Array.from(mergedEventsMap.values());
    // Sort descending by timestamp — handle both ISO strings and epoch integers
    const toMs = (v: any): number => {
      if (!v) return 0;
      if (v instanceof Date) return v.getTime();
      if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
      return new Date(v).getTime() || 0;
    };
    finalEvents.sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));

    return c.json({ success: true, session: mergedSession, events: finalEvents });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * GET /api/jules/search
 *
 * Full-text search across all Jules session prompts.
 * Query parameters:
 *   - q: Required search query
 *   - projectId?: Scope search to a specific project
 *   - limit?: Max results (default 20)
 */
app.get("/search", async (c) => {
  const q = c.req.query("q");
  const projectId = c.req.query("projectId");
  const limit = Math.min(parseInt(c.req.query("limit") || "20"), 100);

  if (!q) {
    return c.json({ success: false, error: "Query parameter 'q' is required" }, 400);
  }

  const db = getDb(c.env.DB);

  try {
    const baseCondition = like(julesSessions.prompt, `%${q}%`);
    const sessions = await db
      .select()
      .from(julesSessions)
      .where(projectId ? and(baseCondition, eq(julesSessions.projectId, projectId)) : baseCondition)
      .orderBy(desc(julesSessions.createdAt))
      .limit(limit);

    return c.json({ success: true, query: q, sessions });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default app;
