/**
 * @file services/agentic-session/factory.ts
 * @description Factory functions for creating and retrieving SessionClient instances.
 *
 * Sessions are addressed by UUID. The DO instance is resolved via
 * `idFromName(sessionId)` — `idFromString` would only accept a 64-char hex
 * blob, not a UUID. The DO lazily creates the D1 row on first publish via
 * `INSERT OR IGNORE` semantics, so there is no explicit `/create` round-trip:
 * `createSession` issues a no-op `system.start` event which doubles as the
 * row-creation handshake.
 */

import { SessionClient } from './client';
import { v4 as uuidv4 } from 'uuid';

/**
 * Get an existing SessionClient for a session ID.
 * @param env - Worker environment bindings
 * @param sessionId - UUID of the session
 * @param userId - Optional user ID (for subject identification)
 * @param agentId - Optional agent ID (for subject identification)
 * @returns SessionClient instance
 */
export function getSession(
  env: Env,
  sessionId: string,
  userId?: string,
  agentId?: string
): SessionClient {
  return new SessionClient({
    sessionId,
    env,
    userId,
    agentId,
  });
}

/**
 * Create a new session and return a SessionClient instance.
 *
 * The DO is contacted via an initial `system.start` publish, which triggers
 * the lazy `INSERT OR IGNORE` createSession in the DO's `handlePublish`
 * branch. The owner is auto-granted `admin` permission so the rest of the
 * client surface (subsequent publishes, grants, WebSocket subscribe) can
 * run without an unauthorized response.
 *
 * @param env - Worker environment bindings
 * @param init - Session initialization data
 * @returns SessionClient instance for the new session
 */
export async function createSession(
  env: Env,
  init: {
    kind: string;
    title: string;
    ownerUserId?: string;
    ownerAgentId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<SessionClient> {
  const sessionId = uuidv4();
  const ownerId = init.ownerUserId || init.ownerAgentId || 'system';

  // Create client instance
  const client = new SessionClient({
    sessionId,
    env,
    userId: init.ownerUserId,
    agentId: init.ownerAgentId,
  });

  // Auto-grant admin to owner BEFORE publishing the first event so the
  // grant exists by the time the WebSocket layer is subscribed to.
  await client.grant(ownerId, ['admin']);

  // Initial system.start event — doubles as the lazy createSession handshake
  // for the DO (it issues INSERT OR IGNORE on the agentic_sessions row
  // before persisting the event).
  await client.publish({
    type: 'system.start',
    payload: {
      sessionName: init.title,
      initiatedBy: ownerId,
      context: {
        kind: init.kind,
        ...(init.metadata ?? {}),
      },
    },
  });

  return client;
}
