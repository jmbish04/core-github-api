/**
 * @file src/db/agent-db.ts
 * @description Drizzle ORM wrapper for Durable Object agent SQLite stateful storage.
 *   Uses drizzle-orm/durable-sqlite to give agents typed, ORM-based DB access.
 */

import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import * as schema from "./events";

export type AgentDb = DrizzleSqliteDODatabase<typeof schema>;

/**
 * Create a Drizzle ORM instance backed by a Durable Object's SQLite storage.
 * Callers must pass `this.ctx.storage` from inside the DO class.
 */
export function getAgentDb(storage: DurableObjectStorage): AgentDb {
  return drizzle(storage, { schema }) as AgentDb;
}

export { schema as agentSchema };
