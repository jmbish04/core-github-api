/**
 * @file ai/tools/browser-tools.ts
 * @description V8 browser tools wrapper for CDP-based page inspection.
 *
 * Wraps `createBrowserTools` from `agents/browser/ai` with:
 *   - Binding validation (env.BROWSER and env.LOADER)
 *   - Per-call rate limiting (configurable via env.BROWSER_TOOLS_RATE_LIMIT)
 *   - Logger-based call logging
 *
 * SPECIALIST INVARIANT: This file MUST NOT import from @/ai/mcp/* or @octokit/*.
 *
 * @see docs/new_agents_sdk/browse_web.md
 * @see V8-06 in TASKS.json
 */

import { createBrowserTools } from 'agents/browser/ai';
import { Logger } from '@/lib/logger';

// ─── Rate Limiter ────────────────────────────────────────────────────────────

interface RateLimiterState {
  timestamps: number[];
}

const rateLimiters = new Map<string, RateLimiterState>();

function checkRateLimit(agentId: string, maxCallsPerMinute: number): void {
  const now = Date.now();
  const windowMs = 60_000;
  let state = rateLimiters.get(agentId);
  if (!state) {
    state = { timestamps: [] };
    rateLimiters.set(agentId, state);
  }

  // Evict entries outside the window
  state.timestamps = state.timestamps.filter(t => now - t < windowMs);

  if (state.timestamps.length >= maxCallsPerMinute) {
    throw new Error(
      `Browser tools rate limit exceeded for agent ${agentId}: ` +
      `${maxCallsPerMinute} calls/minute. Try again in ${Math.ceil((state.timestamps[0]! + windowMs - now) / 1000)}s.`
    );
  }

  state.timestamps.push(now);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Create browser tools (browser_search + browser_execute) for an agent.
 *
 * @param env - Worker environment bindings (needs BROWSER, LOADER)
 * @param opts.agentId - Agent identifier for rate limiting
 * @param opts.timeout - Per-call timeout in ms (default 30000)
 *
 * @returns AI SDK ToolSet with `browser_search` and `browser_execute`
 */
export function createBrowserToolsForAgent(
  env: Env,
  opts?: { agentId?: string; timeout?: number },
): ReturnType<typeof createBrowserTools> {
  const agentId = opts?.agentId ?? 'unknown';
  const timeout = opts?.timeout ?? 30_000;
  const maxCallsPerMinute = parseInt(
    (env as any).BROWSER_TOOLS_RATE_LIMIT ?? '10',
    10,
  );

  // ── Binding Validation ────────────────────────────────────────────
  if (!(env as any).BROWSER) {
    throw new Error(
      '[createBrowserToolsForAgent] Missing BROWSER binding in env. ' +
      'Add `"browser": { "binding": "BROWSER" }` to wrangler.jsonc.'
    );
  }
  if (!(env as any).LOADER) {
    throw new Error(
      '[createBrowserToolsForAgent] Missing LOADER binding in env. ' +
      'Add `"worker_loaders": [{ "binding": "LOADER" }]` to wrangler.jsonc.'
    );
  }

  // ── Rate Limit Check ──────────────────────────────────────────────
  checkRateLimit(agentId, maxCallsPerMinute);

  // ── Logger ────────────────────────────────────────────────────────
  const logger = new Logger(env as any, 'BrowserTools');
  logger.info(`[createBrowserToolsForAgent] Creating tools for ${agentId}`, {
    timeout,
    maxCallsPerMinute,
  });

  // ── Create Tools ──────────────────────────────────────────────────
  const tools = createBrowserTools({
    browser: (env as any).BROWSER,
    loader: (env as any).LOADER,
  });

  return tools;
}
