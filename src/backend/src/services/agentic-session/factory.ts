/**
 * @file services/agentic-session/factory.ts
 * @description Factory functions for creating and retrieving SessionClient instances.
 */

import { SessionClient, SessionClientOptions } from './client';
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

  // Create the session in the DO
  const doId = (env.AGENTIC_SESSION_DO as any).idFromString(sessionId);
  const doStub = (env.AGENTIC_SESSION_DO as any).get(doId);

  const response = await doStub.fetch('http://internal/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      kind: init.kind,
      title: init.title,
      ownerUserId: init.ownerUserId,
      metadata: init.metadata,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create session: ${response.status} ${errorText}`);
  }

  // Create client instance
  const client = new SessionClient({
    sessionId,
    env,
    userId: init.ownerUserId,
    agentId: init.ownerAgentId,
  });

  // Auto-grant admin to owner
  await client.grant(ownerId, ['admin']);

  return client;
}
