/**
 * @file services/agentic-session/d1.ts
 * @description Drizzle query layer for AgenticSession D1 operations.
 *   Provides typed CRUD operations for sessions, events, subscribers, and grants.
 */

import { getDb } from '@db';
import { eq, and, desc, gte, lt, isNull, type SQL } from 'drizzle-orm';
import {
  agenticSessions as sessions,
  sessionEvents,
  sessionSubscribers,
  sessionGrants,
} from './schemas';
import type { SessionStatus, SubscriberType, GranteeType, Permission } from './types';

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
  const updates: { status: SessionStatus; completedAt?: Date } = { status };
  if (status === 'completed' || status === 'error') {
    updates.completedAt = new Date();
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

  // Build the where clause up-front — Drizzle's query builder does not allow
  // .where() to be called after .orderBy(), so conditions must be composed
  // before the terminal chain.
  const whereClause: SQL =
    afterSeq !== undefined
      ? and(
          eq(sessionEvents.sessionId, sessionId),
          gte(sessionEvents.sequenceNum, afterSeq)
        )!
      : eq(sessionEvents.sessionId, sessionId);

  return db
    .select()
    .from(sessionEvents)
    .where(whereClause)
    .orderBy(sessionEvents.sequenceNum)
    .limit(limit)
    .offset(offset)
    .all();
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
    connectedAt: new Date(),
  }).onConflictDoUpdate({
    target: [sessionSubscribers.sessionId, sessionSubscribers.subscriberId],
    set: {
      disconnectedAt: null,
      connectedAt: new Date(),
    },
  });
}

export async function removeSubscriber(
  db: ReturnType<typeof getDb>,
  sessionId: string,
  subscriberId: string
): Promise<void> {
  await db.update(sessionSubscribers)
    .set({ disconnectedAt: new Date() })
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
    .set({ lastHeartbeat: new Date() })
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
    /** Optional expiration, in unix seconds. */
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
    expiresAt: data.expiresAt !== undefined ? new Date(data.expiresAt * 1000) : undefined,
    revoked: false,
  });
}

export async function revokeGrant(
  db: ReturnType<typeof getDb>,
  grantId: string
): Promise<void> {
  await db.update(sessionGrants)
    .set({ revoked: true })
    .where(eq(sessionGrants.id, grantId));
}

export async function checkGrant(
  db: ReturnType<typeof getDb>,
  sessionId: string,
  granteeId: string,
  requiredPermission: Permission
): Promise<boolean> {
  const now = new Date();

  const grant = await db.select()
    .from(sessionGrants)
    .where(
      and(
        eq(sessionGrants.sessionId, sessionId),
        eq(sessionGrants.granteeId, granteeId),
        eq(sessionGrants.revoked, false)
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
          eq(sessionGrants.revoked, false)
        )
      )
      .get();

    if (!wildcardGrant) return false;

    // Check expiry
    if (wildcardGrant.expiresAt && wildcardGrant.expiresAt.getTime() < now.getTime()) {
      return false;
    }

    const permissions = JSON.parse(wildcardGrant.permissions) as Permission[];
    return permissions.includes(requiredPermission) || permissions.includes('admin');
  }

  // Check expiry
  if (grant.expiresAt && grant.expiresAt.getTime() < now.getTime()) {
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
        eq(sessionGrants.revoked, false)
      )
    )
    .all();
}

// ── Expiry queries (exported for cleanup tasks) ──────────────────────────

/**
 * Returns grants whose `expiresAt` is in the past (and not yet revoked).
 * Useful for periodic cleanup.
 */
export async function listExpiredGrants(
  db: ReturnType<typeof getDb>,
  sessionId?: string
) {
  const now = new Date();
  const expiredCondition = lt(sessionGrants.expiresAt, now);
  const whereClause: SQL = sessionId
    ? and(eq(sessionGrants.sessionId, sessionId), expiredCondition)!
    : expiredCondition;

  return db.select().from(sessionGrants).where(whereClause).all();
}
