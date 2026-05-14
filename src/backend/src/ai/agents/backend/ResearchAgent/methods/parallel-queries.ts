/**
 * @file ResearchAgent/methods/parallel-queries.ts
 * @description V8-13 Subagent POC — WebQueryWorker + executeParallelWebQueriesImpl.
 *
 * Proves the Agent-level `this.subAgent()` primitive with a single surgical POC.
 * Each WebQueryWorker child runs in its own isolated SQLite facet, executes
 * a web search query, and returns the result via typed RPC.
 *
 * Cross-specialist invariant: NEVER call `this.subAgent(CloudflareAgent|GithubAgent|…)`.
 * Subagents are for parent-owned ephemeral children only.
 * Cross-specialist dispatch stays on `getPeerAgent` (v7).
 *
 * @see docs/new_agents_sdk/subagents.md
 * @see V8-13 in TASKS.json
 */

import { Agent } from 'agents';
import { getDb } from '@db';
import { webQueryLogs } from '@db/schemas/logs/observability';

// ─── WebQueryWorker (Subagent Class) ─────────────────────────────────────────

/**
 * Ephemeral subagent for parallel web queries.
 *
 * Each instance has its own isolated SQLite and logs queries to a local
 * `query_log` table (CREATE TABLE IF NOT EXISTS on first call).
 *
 * Limitations (per subagents.md §Limitations):
 *   - No schedule() / cancelSchedule() / keepAlive()
 *   - Must NOT be used for cross-specialist dispatch
 *
 * The public `search()` method is automatically exposed as a typed RPC stub
 * on the parent — no @callable decorator needed.
 */
export class WebQueryWorker extends Agent<Env, Record<string, unknown>> {
  private _schemaInitialized = false;

  /**
   * Idempotent SQLite schema setup for the child's isolated storage.
   */
  private async ensureSchema(): Promise<void> {
    if (this._schemaInitialized) return;
    void this.sql`
      CREATE TABLE IF NOT EXISTS query_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        result_summary TEXT
      )
    `;
    this._schemaInitialized = true;
  }

  /**
   * Execute a web search query. Called via typed RPC from the parent.
   * Uses the BROWSER binding if available, otherwise falls back to
   * a simple fetch-based search.
   */
  async search(query: string): Promise<{ query: string; result: string }> {
    await this.ensureSchema();
    const startedAt = new Date().toISOString();

    // Log to child's isolated SQLite
    void this.sql`INSERT INTO query_log (query, started_at, status) VALUES (${query}, ${startedAt}, 'pending')`;

    try {
      // Attempt browser-based search if BROWSER binding is available
      let result: string;
      if ((this.env as any).BROWSER) {
        try {
          const { createBrowserToolsForAgent } = await import('@/ai/tools/browser-tools');
          const tools = createBrowserToolsForAgent(this.env, { agentId: `webquery-worker` });
          // Use the browser_search tool directly if available
          if (tools && (tools as any).browser_search) {
            const searchResult = await (tools as any).browser_search.execute({ query });
            result = typeof searchResult === 'string'
              ? searchResult
              : JSON.stringify(searchResult).slice(0, 4096);
          } else {
            result = await this.fallbackSearch(query);
          }
        } catch {
          result = await this.fallbackSearch(query);
        }
      } else {
        result = await this.fallbackSearch(query);
      }

      const finishedAt = new Date().toISOString();
      void this.sql`UPDATE query_log SET status = 'success', result_summary = ${result.slice(0, 4096)}, finished_at = ${finishedAt} WHERE query = ${query} AND started_at = ${startedAt}`;

      return { query, result };
    } catch (err: any) {
      const finishedAt = new Date().toISOString();
      void this.sql`UPDATE query_log SET status = 'error', result_summary = ${`Error: ${err.message}`.slice(0, 4096)}, finished_at = ${finishedAt} WHERE query = ${query} AND started_at = ${startedAt}`;

      return { query, result: `Error: ${err.message}` };
    }
  }

  /**
   * Fallback search using a simple fetch to a search API.
   */
  private async fallbackSearch(query: string): Promise<string> {
    try {
      const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
      if (!res.ok) return `Search returned HTTP ${res.status}`;
      const data = await res.json() as any;
      return data.AbstractText || data.Abstract || `No abstract found for: ${query}`;
    } catch (err: any) {
      return `Fallback search failed: ${err.message}`;
    }
  }
}

// ─── Parent Orchestrator ─────────────────────────────────────────────────────

/**
 * Fan out multiple web queries to WebQueryWorker subagents in parallel,
 * then aggregate results and mirror to D1 `web_query_logs` table.
 *
 * @param agent - The parent ResearchAgent instance
 * @param args  - Object with `queries: string[]`
 * @returns Aggregated query results
 */
export async function executeParallelWebQueriesImpl(
  agent: any,
  args: { queries: string[] },
): Promise<{
  executionId: string;
  results: Array<{ query: string; result: string; facetName: string; status: string }>;
  totalDurationMs: number;
}> {
  const executionId = crypto.randomUUID();
  const start = Date.now();
  const env: Env = agent.env;

  // Fan out: spawn one WebQueryWorker subagent per query
  const promises = args.queries.map(async (query, i) => {
    const facetName = `web-query-${i}`;
    const startedAt = new Date().toISOString();

    try {
      const stub = await agent.subAgent(WebQueryWorker, facetName);
      const result = await stub.search(query);
      const finishedAt = new Date().toISOString();

      return {
        query,
        result: result.result,
        facetName,
        status: 'success' as const,
        startedAt,
        finishedAt,
      };
    } catch (err: any) {
      const finishedAt = new Date().toISOString();
      return {
        query,
        result: `Error: ${err.message}`,
        facetName,
        status: 'error' as const,
        startedAt,
        finishedAt,
      };
    }
  });

  const results = await Promise.all(promises);
  const totalDurationMs = Date.now() - start;

  // Mirror results to D1 web_query_logs table
  try {
    const db = getDb(env.DB);
    for (const r of results) {
      await db.insert(webQueryLogs).values({
        executionId,
        facetName: r.facetName,
        query: r.query,
        status: r.status,
        resultSummary: r.result.slice(0, 4096),
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
      });
    }
  } catch {
    // Non-blocking: D1 mirror failure doesn't break the query results
  }

  // Clean up subagents after use
  for (let i = 0; i < args.queries.length; i++) {
    try {
      await agent.deleteSubAgent(`web-query-${i}`);
    } catch {
      // Best-effort cleanup
    }
  }

  return {
    executionId,
    results: results.map(r => ({
      query: r.query,
      result: r.result,
      facetName: r.facetName,
      status: r.status,
    })),
    totalDurationMs,
  };
}
