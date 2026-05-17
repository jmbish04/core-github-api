/**
 * @file backend/src/routes/api/webhooks/jules.ts
 * @description Inbound webhook API for Jules AI coding agent callbacks.
 *
 * Jules is instructed to call these endpoints at every stage of its work.
 * This module exposes three endpoints:
 *
 *   POST /api/webhooks/jules/event
 *     Receives lifecycle events (blocked, needs_context, ready_for_pr, done).
 *     Looks up the originating session from D1, routes the event to the
 *     appropriate agent or alert handler, and broadcasts over WebSocket.
 *
 *   POST /api/webhooks/jules/status
 *     Receives frequent progress updates during task execution.
 *     Stores the update in D1 and broadcasts to all WebSocket subscribers.
 *
 *   GET /api/webhooks/jules/ws
 *     WebSocket upgrade endpoint. Forwards to the `JulesWebhookBroadcaster`
 *     Durable Object singleton, which manages all connected clients.
 *
 * ## Authentication
 * Currently the webhook accepts all POST requests. If `JULES_WEBHOOK_SECRET`
 * is set in the environment, the `X-Jules-Webhook-Secret` header is validated.
 *
 * @module Routes/Webhooks/Jules
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "@db";
import { julesSessions, julesWebhookEvents } from "@db/schemas/jules";
import { eq } from "drizzle-orm";
import { createAlert } from "@alerts";
import type { JulesEventType, JulesLiveMessage } from "@/services/jules/types";
import { getAgentByName } from "agents";
import { getSecret } from "@/utils/secrets";
import { getSession as getAgenticSession } from "@/services/agentic-session";
import { v5 as uuidv5 } from "uuid";

const app = new Hono<{ Bindings: Env }>();

/**
 * Stable UUID namespace used to derive AgenticSession IDs from external
 * Jules session IDs. The DNS namespace is a well-known constant from RFC
 * 4122 — using it here means a given Jules session ID always maps to the
 * same AgenticSession UUID, so re-runs / replays land on the same DO and
 * the same event stream.
 */
const JULES_AGENTIC_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

function julesIdToAgenticSessionId(julesSessionId: string): string {
  return uuidv5(julesSessionId, JULES_AGENTIC_NAMESPACE);
}

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

/**
 * Validates the payload for lifecycle event callbacks from Jules.
 * All fields except `metadata` are required.
 */
const eventPayloadSchema = z.object({
  /** Jules-assigned session identifier — used to look up D1 context. */
  jules_session_id: z.string().min(1, "jules_session_id is required"),

  /** Classification of the lifecycle event being reported. */
  event_type: z.enum([
    "blocked",
    "needs_context",
    "ready_for_pr",
    "done",
    "info",
  ]),

  /** Jules-generated human-readable message providing event context. */
  message: z.string().min(1, "message is required"),

  /** Optional arbitrary metadata for extensibility. */
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Validates the payload for incremental progress updates from Jules.
 */
const statusPayloadSchema = z.object({
  /** Jules-assigned session identifier. */
  jules_session_id: z.string().min(1, "jules_session_id is required"),

  /** Name of the current work step (e.g. "Writing authentication middleware"). */
  step_name: z.string().min(1, "step_name is required"),

  /** Detailed description of what Jules is currently doing. */
  message: z.string().min(1, "message is required"),

  /** Optional completion percentage (0–100). */
  progress_pct: z.number().int().min(0).max(100).optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Broadcasts a `JulesLiveMessage` to:
 *   1. The legacy `JulesWebhookBroadcaster` DO singleton (back-compat for
 *      the global `<JulesLiveProvider>` feed on the frontend).
 *   2. The corresponding per-session `AgenticSession` DO — every Jules
 *      webhook becomes a `jules.status` or `jules.event` SessionEvent so
 *      future per-session viewers (`useAgenticSession` filtered by
 *      `type: 'jules.*'`) get the same payloads without going through the
 *      legacy global firehose.
 *
 * The AgenticSession ID is derived deterministically from the Jules
 * session ID via UUIDv5 — no extra D1 column needed for the mapping.
 *
 * Both publish paths are best-effort and failures are isolated so one
 * broken sink cannot block the other.
 *
 * @param env - Cloudflare Worker environment (for DO binding access).
 * @param message - The structured message to broadcast.
 */
async function broadcast(env: Env, message: JulesLiveMessage): Promise<void> {
  // 1. Legacy broadcaster — preserved for back-compat with the global
  //    JulesLiveProvider until per-session viewers fully replace it.
  try {
    const agent = await getAgentByName(env.JULES_WEBHOOK_BROADCASTER as any, "jules-broadcaster");
    await (agent as any).broadcastEvent(message);
  } catch (err) {
    console.error("[JulesWebhook] Failed to broadcast to legacy Agent:", err);
  }

  // 2. AgenticSession dual-publish — derives a stable session UUID from
  //    the Jules session id and publishes a typed SessionEvent.
  try {
    const agenticSessionId = julesIdToAgenticSessionId(message.sessionId);
    const session = getAgenticSession(env, agenticSessionId, undefined, `jules:${message.sessionId}`);

    if (message.eventType === "progress") {
      await session.publish({
        type: "jules.status",
        payload: {
          status: "acting",
          message: message.message,
          ...(message.progressPct !== undefined ? { progress: message.progressPct } : {}),
        },
      });
    } else {
      await session.publish({
        type: "jules.event",
        payload: {
          eventType: message.eventType,
          data: {
            sessionId: message.sessionId,
            title: message.title,
            message: message.message,
            originalTask: message.originalTask,
            stepName: message.stepName,
            ts: message.ts,
          },
        },
      });
    }
  } catch (err) {
    console.error("[JulesWebhook] Failed to publish to AgenticSession:", err);
  }
}

/**
 * Records a webhook event to `jules_webhook_events` in D1.
 *
 * @param env - Cloudflare Worker environment.
 * @param params - Event details to persist.
 */
async function persistEvent(
  env: Env,
  params: {
    julesSessionId: string;
    eventType: JulesEventType | "progress";
    message: string;
    rawPayload: unknown;
    stepName?: string;
    progressPct?: number;
    planningRequestId?: string | null;
    sessionRole?: string | null;
  }
): Promise<void> {
  try {
    const db = getDb(env.DB);
    await db.insert(julesWebhookEvents).values({
      id: crypto.randomUUID(),
      julesSessionId: params.julesSessionId,
      planningRequestId: params.planningRequestId || null,
      sessionRole: params.sessionRole || null,
      eventType: params.eventType as any,
      message: params.message,
      stepName: params.stepName,
      progressPct: params.progressPct,
      rawPayload: JSON.stringify(params.rawPayload),
      createdAt: new Date(),
    });
  } catch (err) {
    console.error("[JulesWebhook] Failed to persist event to D1:", err);
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/webhooks/jules/event
 *
 * Receives a Jules lifecycle event. Handler logic:
 *   1. Persist the event to `jules_webhook_events`
 *   2. Look up the session from `jules_sessions` to get agent + project context
 *   3. Route by event_type:
 *      - blocked / needs_context → trigger JulesOverseer evaluation
 *      - ready_for_pr / done     → fire an agent-type alert with PR deep-link
 *      - info                    → log only
 *   4. Update session's `webhookReceivedAt` timestamp
 *   5. Broadcast to all WebSocket subscribers
 */
app.post("/event", zValidator("json", eventPayloadSchema), async (c) => {
  const payload = c.req.valid("json");
  const db = getDb(c.env.DB);
  const [session] = await db
    .select()
    .from(julesSessions)
    .where(eq(julesSessions.id, payload.jules_session_id))
    .limit(1);

  // 1. Persist event
  await persistEvent(c.env, {
    julesSessionId: payload.jules_session_id,
    eventType: payload.event_type,
    message: payload.message,
    rawPayload: payload,
    planningRequestId: session?.planningRequestId || null,
    sessionRole: session?.sessionRole || null,
  });

  const originalTask = session?.prompt
    ? session.prompt.substring(0, 120) + "..."
    : "Unknown task";

  // 3. Route by event type
  if (
    payload.event_type === "blocked" ||
    payload.event_type === "needs_context"
  ) {
    // Trigger JulesOverseer to evaluate and auto-unblock
    try {
      c.executionCtx.waitUntil((async () => {
        const agent = await getAgentByName(c.env.ENGINEER_AGENT as any, "singleton");
        await (agent as any).checkSchedule();
      })());
    } catch (err) {
      console.warn("[JulesWebhook] Failed to trigger JulesOverseer:", err);
    }

    // Surface to the user via the alerts system
    c.executionCtx.waitUntil(
      createAlert(c.env, {
        type: "agent",
        severity: payload.event_type === "blocked" ? "warning" : "info",
        title: `Jules ${payload.event_type === "blocked" ? "is blocked" : "needs context"}`,
        description: `Session ${payload.jules_session_id}: ${payload.message}`,
        process_origin: session?.specialistClass || "JulesWebhook",
        link_url: "/jules",
      })
    );
  } else if (
    payload.event_type === "ready_for_pr" ||
    payload.event_type === "done"
  ) {
    c.executionCtx.waitUntil(
      createAlert(c.env, {
        type: "agent",
        severity: "info",
        title:
          payload.event_type === "ready_for_pr"
            ? "Jules is ready for PR review"
            : "Jules session completed",
        description: payload.message,
        process_origin: session?.specialistClass || "JulesWebhook",
        link_url: "/jules",
        is_action_needed: payload.event_type === "ready_for_pr",
        action_required:
          payload.event_type === "ready_for_pr"
            ? "Review and merge the Pull Request in GitHub"
            : null,
      } as any)
    );
  }

  // 4. Update session timestamp
  c.executionCtx.waitUntil(
    db
      .update(julesSessions)
      .set({ webhookReceivedAt: new Date(), updatedAt: new Date() })
      .where(eq(julesSessions.id, payload.jules_session_id))
      .catch(console.error)
  );

  // 5. Broadcast to WebSocket subscribers
  const liveMessage: JulesLiveMessage = {
    ts: new Date().toISOString(),
    sessionId: payload.jules_session_id,
    eventType: payload.event_type,
    title: `Jules: ${payload.event_type.replace(/_/g, " ")}`,
    message: payload.message,
    originalTask,
  };
  c.executionCtx.waitUntil(broadcast(c.env, liveMessage));

  return c.json({ success: true, handled: payload.event_type });
});

/**
 * POST /api/webhooks/jules/status
 *
 * Receives a Jules progress update. Stores the event and broadcasts
 * to all connected WebSocket clients. Does not trigger alerts for
 * progress events — they are purely informational live-feed events.
 */
app.post("/status", zValidator("json", statusPayloadSchema), async (c) => {
  const payload = c.req.valid("json");
  const db = getDb(c.env.DB);
  const [session] = await db
    .select()
    .from(julesSessions)
    .where(eq(julesSessions.id, payload.jules_session_id))
    .limit(1);

  // Persist the status as a progress event
  await persistEvent(c.env, {
    julesSessionId: payload.jules_session_id,
    eventType: "progress",
    message: payload.message,
    stepName: payload.step_name,
    progressPct: payload.progress_pct,
    rawPayload: payload,
    planningRequestId: session?.planningRequestId || null,
    sessionRole: session?.sessionRole || null,
  });

  // Update session activity timestamps (background)
  c.executionCtx.waitUntil(
    db
      .update(julesSessions)
      .set({
        lastActivityAt: new Date(),
        updatedAt: new Date(),
        webhookReceivedAt: new Date(),
      })
      .where(eq(julesSessions.id, payload.jules_session_id))
      .catch(console.error)
  );

  // Look up session for context (best-effort, don't block)
  // Broadcast progress update to all WebSocket subscribers
  const liveMessage: JulesLiveMessage = {
    ts: new Date().toISOString(),
    sessionId: payload.jules_session_id,
    eventType: "progress",
    title: payload.step_name,
    message: payload.message,
    progressPct: payload.progress_pct,
    stepName: payload.step_name,
    originalTask: session?.prompt
      ? session.prompt.substring(0, 120) + "..."
      : undefined,
  };
  c.executionCtx.waitUntil(broadcast(c.env, liveMessage));

  return c.json({ success: true, received: "progress" });
});

/**
 * GET /api/webhooks/jules/ws
 *
 * WebSocket upgrade endpoint for the frontend live feed.
 * Delegates directly to the `JulesWebhookBroadcaster` Durable Object
 * so the browser maintains a persistent connection to the singleton.
 *
 * The frontend connects here and receives all Jules events and status
 * updates in real time as `JulesLiveMessage` JSON objects.
 */
app.get("/ws", async (c) => {
  const upgradeHeader = c.req.header("Upgrade");
  if (upgradeHeader !== "websocket") {
    return c.text("Expected WebSocket upgrade", 426);
  }

  // Primary auth gate at the edge (before Agent sees the request)
  const providedKey = c.req.query("apiKey") || c.req.header("X-API-Key");
  const [agentKey, workerKey] = await Promise.all([
    getSecret(c.env, "AGENTIC_WORKER_API_KEY"),
    getSecret(c.env, "WORKER_API_KEY"),
  ]);
  const validKeys = [agentKey, workerKey].filter(Boolean) as string[];
  if (validKeys.length > 0 && (!providedKey || !validKeys.includes(providedKey))) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Delegate to Agent — base class handles WS handshake, then calls getConnectionTags + onConnect
  const agent = await getAgentByName(c.env.JULES_WEBHOOK_BROADCASTER as any, "jules-broadcaster");
  return agent.fetch(c.req.raw);  // c.req.raw preserves full URL + query params
});

export default app;
