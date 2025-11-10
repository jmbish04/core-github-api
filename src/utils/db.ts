import { Kysely } from 'kysely';
import { D1Dialect } from 'kysely-d1';
import { drizzle, DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '../schemas/dbSchemas';
import { TestDef, TestResult } from '../schemas/dbSchemas';
import { Env } from '../types';

export function getKysely(env: Env) {
  return new Kysely<schema.DB>({
    dialect: new D1Dialect({ database: env.DB }),
  });
}

export function getDrizzle(env: Env): DrizzleD1Database<typeof schema> {
  return drizzle(env.DB, { schema });
}

// Helper functions
export async function listActiveTests(db: Kysely<schema.DB>): Promise<TestDef[]> {
  return await db.selectFrom('test_defs').selectAll().where('is_active', '=', 1).execute();
}

export async function insertTestResult(db: Kysely<schema.DB>, result: Omit<TestResult, 'created_at' | 'id'>) {
  const id = crypto.randomUUID();
  await db.insertInto('test_results').values({ ...result, id, created_at: new Date().toISOString() }).execute();
  return id;
}

export async function getLatestSessionResults(db: Kysely<schema.DB>) {
    const latestSession = await db
      .selectFrom('test_results')
      .select('session_uuid')
      .orderBy('started_at', 'desc')
      .limit(1)
      .executeTakeFirst();

    if (!latestSession) {
      return { session_uuid: null, results: [] };
    }

    const results = await db
      .selectFrom('test_results')
      .selectAll()
      .where('session_uuid', '=', latestSession.session_uuid)
      .orderBy('started_at', 'asc')
      .execute();

    // Fetch test definitions for each result
    const testIds = [...new Set(results.map(r => r.test_fk))];
    const tests = await db
        .selectFrom('test_defs')
        .selectAll()
        .where('id', 'in', testIds)
        .execute();

    const testsById = Object.fromEntries(tests.map(t => [t.id, t]));

    return {
      session_uuid: latestSession.session_uuid,
      results: results.map(r => ({ ...r, test: testsById[r.test_fk] })),
    };
}

export async function getSessionResults(db: Kysely<schema.DB>, sessionId: string) {
    const results = await db
        .selectFrom('test_results')
        .selectAll()
        .where('session_uuid', '=', sessionId)
        .orderBy('started_at', 'asc')
        .execute();

    if (results.length === 0) {
        return { session_uuid: sessionId, results: [] };
    }

    const testIds = [...new Set(results.map(r => r.test_fk))];
    const tests = await db
        .selectFrom('test_defs')
        .selectAll()
        .where('id', 'in', testIds)
        .execute();

    const testsById = Object.fromEntries(tests.map(t => [t.id, t]));

    return {
        session_uuid: sessionId,
        results: results.map(r => ({ ...r, test: testsById[r.test_fk] })),
    };
}
