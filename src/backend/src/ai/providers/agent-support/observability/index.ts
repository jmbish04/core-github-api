/**
 * @file ai/providers/agent-support/observability/index.ts
 * @description V8 Observability entrypoint.
 *
 * Call `registerObservability(env)` once during the worker boot path
 * (src/backend/src/index.ts) to attach diagnostic channel subscribers
 * that forward agent events to Logger and a ring buffer.
 *
 * Module-scope idempotent guard ensures safe re-entry across DO restarts.
 *
 * @see docs/new_agents_sdk/observability.md
 * @see V8-02 in TASKS.json
 */

import { Logger } from '@/lib/logger';
import {
  registerSubscribers,
  setObservabilityLogger,
  setObservabilityEnv,
} from './subscribers';

export { peekRecentEvents, getBufferSize, type ObservabilityEvent } from './subscribers';

// ─── Idempotent Guard ────────────────────────────────────────────────────────

let _initialized = false;

/**
 * Register observability subscribers. Safe to call multiple times —
 * only the first invocation sets up subscriptions.
 *
 * @param env - Worker environment bindings (needed for Logger construction)
 */
export function registerObservability(env: Env): void {
  if (_initialized) return;
  _initialized = true;

  // Create a dedicated Logger instance for observability events
  const logger = new Logger(env as any, 'Observability');
  setObservabilityLogger(logger);

  // Inject env for D1 persistence
  setObservabilityEnv(env);

  // Attach channel subscribers
  registerSubscribers();
}
