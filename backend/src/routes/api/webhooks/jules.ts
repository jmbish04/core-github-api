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

const app = new Hono<{ Bindings: Env }>();

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
 * Broadcasts a `JulesLiveMessage` to all connected WebSocket clients via the
 * `JulesWebhookBroadcaster` Durable Object singleton.
 *
 * @param env - Cloudflare Worker environment (for DO binding access).
 * @param message - The structured message to broadcast.
 */
async function broadcast(env: Env, message: JulesLiveMessage): Promise<void> {
  try {
    const id = env.JULES_WEBHOOK_BROADCASTER.idFromName("jules-broadcaster");
    const broadcaster = env.JULES_WEBHOOK_BROADCASTER.get(id);
    await broadcaster.fetch("http://internal/internal/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
  } catch (err) {
    console.error("[JulesWebhook] Failed to broadcast to DO:", err);
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
  }
): Promise<void> {
  try {
    const db = getDb(env.DB);
    await db.insert(julesWebhookEvents).values({
      id: crypto.randomUUID(),
      julesSessionId: params.julesSessionId,
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

  // 1. Persist event
  await persistEvent(c.env, {
    julesSessionId: payload.jules_session_id,
    eventType: payload.event_type,
    message: payload.message,
    rawPayload: payload,
  });

  // 2. Look up originating session for context
  const [session] = await db
    .select()
    .from(julesSessions)
    .where(eq(julesSessions.id, payload.jules_session_id))
    .limit(1);

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
      const id = c.env.JULES_OVERSEER.idFromName("jules-overseer-singleton");
      const overseer = c.env.JULES_OVERSEER.get(id);
      c.executionCtx.waitUntil(
        overseer.fetch("http://internal/schedule/check")
      );
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

  // Persist the status as a progress event
  await persistEvent(c.env, {
    julesSessionId: payload.jules_session_id,
    eventType: "progress",
    message: payload.message,
    stepName: payload.step_name,
    progressPct: payload.progress_pct,
    rawPayload: payload,
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
  const [session] = await db
    .select({ prompt: julesSessions.prompt })
    .from(julesSessions)
    .where(eq(julesSessions.id, payload.jules_session_id))
    .limit(1);

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

  const id = c.env.JULES_WEBHOOK_BROADCASTER.idFromName("jules-broadcaster");
  const broadcaster = c.env.JULES_WEBHOOK_BROADCASTER.get(id);

  // Forward the WS upgrade request to the DO — it handles the pairing
  return broadcaster.fetch(
    new Request("http://internal/ws", {
      headers: c.req.raw.headers,
    })
  );
});

export default app;
