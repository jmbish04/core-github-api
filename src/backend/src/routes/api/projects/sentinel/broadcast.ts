/**
 * @file backend/src/routes/api/projects/sentinel/broadcast.ts
 * @description Posts a JSON payload to JulesWebhookBroadcaster Agent for
 * fan-out to all WebSocket subscribers. Used by claim, update, submit,
 * clarify, and ingest handlers.
 *
 * @module Sentinel/Broadcast
 */

import { getAgentByName } from "agents";
import { Logger } from '@lib/logger';

/**
 * Broadcasts a sentinel event to all connected WebSocket clients via the
 * `JulesWebhookBroadcaster` Agent singleton.
 *
 * @param env - Cloudflare Worker environment (for DO binding access).
 * @param payload - The structured event payload to broadcast.
 */
export async function broadcastSentinelEvent(env: Env, payload: Record<string, unknown>): Promise<void> {
    const logger = new Logger(env, "broadcastSentinelEvent");
    try {
        const agent = await getAgentByName(env.JULES_WEBHOOK_BROADCASTER as any, "jules-broadcaster");
        await (agent as any).broadcastEvent({ source: "sentinel", ...payload });

        logger.info(`Successfully broadcasted sentinel event`);
    } catch (err: any) {
        logger.error(`Failed to broadcast sentinel event: ${err.message}`);
    }
}
