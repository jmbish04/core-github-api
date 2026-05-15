/**
 * @file services/agentic-session/d1.ts
 * @description Drizzle query layer for AgenticSession D1 operations.
 *   Provides typed CRUD operations for sessions, events, subscribers, and grants.
 */

import { getDb } from '@db';
import { eq, and, desc, gte, lte, isNull } from 'drizzle-orm';
import {
  agenticSessions as sessions,
  sessionEvents,
  sessionSubscribers,
  sessionGrants,
} from './schemas';
import type { SessionEvent, SessionStatus, SubscriberType, GranteeType, Permission } from './types';

// ── Session Operations ───────────────────────────────────────────────────

export async function createSession(
  db: ReturnType<typeof getDb>,
  data: {
    id: string;
    name?: string;
    createdBy?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await db.insert(sessions).values({
    id: data.id,
    name: data.name,
    createdBy: data.createdBy,
    metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
    status: 'active',
  });
}

export async function getSession(
  db: ReturnType<typeof getDb>,
  sessionId: string
) {
  return db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
}

export async function updateSessionStatus(
  db: ReturnType<typeof getDb>,
  sessionId: string,
  status: SessionStatus
): Promise<void> {
  const updates: Record<string, unknown> = { status };
  if (status === 'completed' || status === 'error') {
    updates.completedAt = Math.floor(Date.now() / 1000);
  }

  await db.update(sessions)
    .set(updates)
    .where(eq(sessions.id, sessionId));
}

export async function listActiveSessions(
  db: ReturnType<typeof getDb>,
  limit: number = 50
) {
  return db.select()
    .from(sessions)
    .where(eq(sessions.status, 'active'))
    .orderBy(desc(sessions.createdAt))
    .limit(limit)
    .all();
}

// ── Event Operations ─────────────────────────────────────────────────────

export async function appendEvent(
  db: ReturnType<typeof getDb>,
  event: {
    id: string;
    sessionId: string;
    type: string;
    payload: Record<string, unknown>;
    sequenceNum: number;
  }
): Promise<void> {
  await db.insert(sessionEvents).values({
    id: event.id,
    sessionId: event.sessionId,
    type: event.type,
    payload: JSON.stringify(event.payload),
    sequenceNum: event.sequenceNum,
  });
}

export async function getEvents(
  db: ReturnType<typeof getDb>,
  sessionId: string,
  options: { limit?: number; offset?: number; afterSeq?: number } = {}
) {
  const { limit = 100, offset = 0, afterSeq } = options;

  let query = db.select()
    .from(sessionEvents)
    .where(eq(sessionEvents.sessionId, sessionId))
    .orderBy(sessionEvents.sequenceNum);

  if (afterSeq !== undefined) {
    query = query.where(gte(sessionEvents.sequenceNum, afterSeq));
  }

  return query.limit(limit).offset(offset).all();
}

export async function getLatestSequenceNum(
  db: ReturnType<typeof getDb>,
  sessionId: string
): Promise<number> {
  const result = await db.select({ seq: sessionEvents.sequenceNum })
    .from(sessionEvents)
    .where(eq(sessionEvents.sessionId, sessionId))
    .orderBy(desc(sessionEvents.sequenceNum))
    .limit(1)
    .get();

  return result?.seq ?? -1;
}

// ── Subscriber Operations ────────────────────────────────────────────────

export async function addSubscriber(
  db: ReturnType<typeof getDb>,
  data: {
    sessionId: string;
    subscriberId: string;
    subscriberType: SubscriberType;
  }
): Promise<void> {
  await db.insert(sessionSubscribers).values({
    sessionId: data.sessionId,
    subscriberId: data.subscriberId,
    subscriberType: data.subscriberType,
    connectedAt: Math.floor(Date.now() / 1000),
  }).onConflictDoUpdate({
    target: [sessionSubscribers.sessionId, sessionSubscribers.subscriberId],
    set: {
      disconnectedAt: null,
      connectedAt: Math.floor(Date.now() / 1000),
    },
  });
}

export async function removeSubscriber(
  db: ReturnType<typeof getDb>,
  sessionId: string,
  subscriberId: string
): Promise<void> {
  await db.update(sessionSubscribers)
    .set({ disconnectedAt: Math.floor(Date.now() / 1000) })
    .where(
      and(
        eq(sessionSubscribers.sessionId, sessionId),
        eq(sessionSubscribers.subscriberId, subscriberId)
      )
    );
}

export async function updateHeartbeat(
  db: ReturnType<typeof getDb>,
  sessionId: string,
  subscriberId: string
): Promise<void> {
  await db.update(sessionSubscribers)
    .set({ lastHeartbeat: Math.floor(Date.now() / 1000) })
    .where(
      and(
        eq(sessionSubscribers.sessionId, sessionId),
        eq(sessionSubscribers.subscriberId, subscriberId)
      )
    );
}

export async function getActiveSubscribers(
  db: ReturnType<typeof getDb>,
  sessionId: string
) {
  return db.select()
    .from(sessionSubscribers)
    .where(
      and(
        eq(sessionSubscribers.sessionId, sessionId),
        isNull(sessionSubscribers.disconnectedAt)
      )
    )
    .all();
}

// ── Grant Operations ─────────────────────────────────────────────────────

export async function createGrant(
  db: ReturnType<typeof getDb>,
  data: {
    id: string;
    sessionId: string;
    granteeId: string;
    granteeType: GranteeType;
    permissions: Permission[];
    grantedBy?: string;
    expiresAt?: number;
  }
): Promise<void> {
  await db.insert(sessionGrants).values({
    id: data.id,
    sessionId: data.sessionId,
    granteeId: data.granteeId,
    granteeType: data.granteeType,
    permissions: JSON.stringify(data.permissions),
    grantedBy: data.grantedBy,
    expiresAt: data.expiresAt,
    revoked: 0,
  });
}

export async function revokeGrant(
  db: ReturnType<typeof getDb>,
  grantId: string
): Promise<void> {
  await db.update(sessionGrants)
    .set({ revoked: 1 })
    .where(eq(sessionGrants.id, grantId));
}

export async function checkGrant(
  db: ReturnType<typeof getDb>,
  sessionId: string,
  granteeId: string,
  requiredPermission: Permission
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);

  const grant = await db.select()
    .from(sessionGrants)
    .where(
      and(
        eq(sessionGrants.sessionId, sessionId),
        eq(sessionGrants.granteeId, granteeId),
        eq(sessionGrants.revoked, 0)
      )
    )
    .get();

  if (!grant) {
    // Check for wildcard grant
    const wildcardGrant = await db.select()
      .from(sessionGrants)
      .where(
        and(
          eq(sessionGrants.sessionId, sessionId),
          eq(sessionGrants.granteeId, '*'),
          eq(sessionGrants.revoked, 0)
        )
      )
      .get();

    if (!wildcardGrant) return false;

    // Check expiry
    if (wildcardGrant.expiresAt && wildcardGrant.expiresAt < now) {
      return false;
    }

    const permissions = JSON.parse(wildcardGrant.permissions) as Permission[];
    return permissions.includes(requiredPermission) || permissions.includes('admin');
  }

  // Check expiry
  if (grant.expiresAt && grant.expiresAt < now) {
    return false;
  }

  const permissions = JSON.parse(grant.permissions) as Permission[];
  return permissions.includes(requiredPermission) || permissions.includes('admin');
}

export async function listGrants(
  db: ReturnType<typeof getDb>,
  sessionId: string
) {
  return db.select()
    .from(sessionGrants)
    .where(
      and(
        eq(sessionGrants.sessionId, sessionId),
        eq(sessionGrants.revoked, 0)
      )
    )
    .all();
}
