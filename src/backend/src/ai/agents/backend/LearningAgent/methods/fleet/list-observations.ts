/**
 * @file LearningAgent/methods/listFleetObservations.ts
 * @description Paginated query over `fleet_observations` table for the
 *              frontend dashboard and API consumers.
 */
import { eq, and, desc, sql } from 'drizzle-orm';
import { getDb } from '@db';
import { fleetObservations, type FleetObservation } from '@db/schemas/agents/fleet-observations';
import type { LearningAgent } from '../../index';
import type { FleetObservationFilter } from '../../types';

export interface FleetObservationListResult {
  items: FleetObservation[];
  total: number;
  limit: number;
  offset: number;
}

export async function listFleetObservations(
  agent: LearningAgent,
  filter: FleetObservationFilter,
): Promise<FleetObservationListResult> {
  const env = agent.getEnv();
  const db = getDb(env.DB);
  const limit = Math.min(filter.limit ?? 50, 200);
  const offset = filter.offset ?? 0;

  // Build WHERE conditions dynamically
  const conditions = [];
  if (filter.workerName) {
    conditions.push(eq(fleetObservations.workerName, filter.workerName));
  }
  if (filter.source) {
    conditions.push(eq(fleetObservations.source, filter.source as any));
  }
  if (filter.hitlPromoted !== undefined) {
    conditions.push(eq(fleetObservations.hitlPromoted, filter.hitlPromoted ? 1 : 0));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const items = await db
    .select()
    .from(fleetObservations)
    .where(whereClause)
    .orderBy(desc(fleetObservations.updatedAt))
    .limit(limit)
    .offset(offset);

  // Count query
  const countResult = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(fleetObservations)
    .where(whereClause);

  const total = countResult[0]?.count ?? 0;

  return { items, total, limit, offset };
}
