/**
 * @file EngineerAgent/health.ts
 * @description Health probe for EngineerAgent — reports active fleet sessions.
 */
export interface EngineerHealth {
  status: string;
  agent: string;
  timestamp: string;
  activeSessions: number;
}

export function buildEngineerHealth(ctx: DurableObjectState): EngineerHealth {
  let activeSessions = 0;
  try {
    const row = ctx.storage.sql.exec(
      `SELECT COUNT(*) as cnt FROM swe_fleet_sessions WHERE status = 'active'`,
    ).toArray();
    activeSessions = (row[0] as any)?.cnt ?? 0;
  } catch {
    // Table doesn't exist yet
  }

  return {
    status: "ok",
    agent: "EngineerAgent",
    timestamp: new Date().toISOString(),
    activeSessions,
  };
}
