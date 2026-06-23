/**
 * AI Provider Fallback Logging & Context Management
 * 
 * This module coordinates the behavior when a primary AI provider fails 
 * and a fallback is triggered. It ensures the event is recorded in 
 * persistent logs and flagged in the response metadata.
 * 
 * @module AI/Fallback
 */
import { FallbackAlert } from "./providers";
import { drizzle } from "drizzle-orm/d1";
import { requestLogs } from "@db/schema";
import { Context } from "hono";
import { Logger } from "@/lib/logger";

/**
 * Creates an `onFallback` handler for the AI subsystem.
 * 
 * Responsibilities:
 * 1. Attaches the `fallbackAlert` to the Hono context for API payload inclusion.
 * 2. Asynchronously logs the fallback event to D1 `requestLogs`.
 * 
 * @param c - The Hono Context for the current request.
 * @returns A handler function that accepts a `FallbackAlert`.
 * @agent-note Use this in route handlers to ensure visibility of automatic provider transitions.
 */
export function createFallbackHandler(c: Context<any>) {
  return (alert: FallbackAlert) => {
    // 1. Set flag in Hono context
    c.set("fallbackAlert", alert);

    // 2. Fire-and-forget D1 log
    c.executionCtx.waitUntil(
      (async () => {
        try {
          const db = drizzle(c.env.DB);
          await db.insert(requestLogs).values({
            timestamp: new Date().toISOString(),
            level: "WARN",
            message: `[AI_FALLBACK] Provider fallback triggered`,
            method: "APP_LAYER",
            path: new URL(c.req.url).pathname,
            status: 200,
            latencyMs: 0,
            payloadSizeBytes: 0,
            correlationId: c.get("requestId") || crypto.randomUUID(),
            metadata: JSON.stringify({
              type: "ai_fallback",
              ...alert
            })
          });
        } catch (err: any) {
          const logger = new Logger(c.env, "FallbackLogger");
          logger.error("Failed to write AI fallback D1 log", { error: String(err) });
        }
      })()
    );
  };
}
