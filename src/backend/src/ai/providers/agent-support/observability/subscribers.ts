/**
 * @file ai/observability/subscribers.ts
 * @description Observability subscriber bindings for the Agents SDK v8.
 *
 * Subscribes to diagnostic channels emitted by the Agents SDK (rpc, state,
 * lifecycle, schedule, mcp, message) and forwards structured events to:
 *   1. A process-scope ring buffer (max 200 events, consumed by V8-11 metrics-tap)
 *   2. Logger.persist() for D1 cold-path archival
 *
 * Uses `subscribe()` from `agents/observability` for type-safe channel handlers.
 *
 * @see docs/new_agents_sdk/observability.md
 */

import { subscribe } from 'agents/observability';
import { getDb } from '@db';
import { observabilityEvents } from '@db/schemas/logs/observability';

// ─── Ring Buffer ─────────────────────────────────────────────────────────────

const MAX_RING_SIZE = 200;

export interface ObservabilityEvent {
  channel: string;
  type: string;
  agent: string;
  name: string;
  payload: Record<string, unknown>;
  timestamp: number;
  capturedAt: number;
}

/** Module-scope ring buffer. Survives DO restarts within a single isolate. */
const ringBuffer: ObservabilityEvent[] = [];

function pushEvent(channel: string, event: { type: string; agent: string; name: string; payload: Record<string, unknown>; timestamp: number }): void {
  const entry: ObservabilityEvent = {
    channel,
    type: event.type,
    agent: event.agent,
    name: event.name,
    payload: event.payload,
    timestamp: event.timestamp,
    capturedAt: Date.now(),
  };
  ringBuffer.push(entry);
  if (ringBuffer.length > MAX_RING_SIZE) {
    ringBuffer.shift();
  }
}

/**
 * Peek at recent events without mutating the buffer.
 * Used by V8-11 metrics-tap for health report enrichment.
 */
export function peekRecentEvents(filter?: { channel?: string }): ObservabilityEvent[] {
  if (!filter?.channel) return [...ringBuffer];
  return ringBuffer.filter(e => e.channel === filter.channel);
}

/**
 * Get the current ring buffer size (for diagnostics).
 */
export function getBufferSize(): number {
  return ringBuffer.length;
}

// ─── Logger Bridge ───────────────────────────────────────────────────────────

type LoggerLike = {
  info(msg: string, meta?: any): void;
  error(msg: string, meta?: any): void;
};

let _logger: LoggerLike | null = null;

/**
 * Inject a Logger instance for D1 cold-path persistence.
 * Called once during registerObservability().
 */
export function setObservabilityLogger(logger: LoggerLike): void {
  _logger = logger;
}

function logEvent(channel: string, event: Record<string, unknown>): void {
  if (!_logger) return;
  try {
    _logger.info(`[obs] ${channel}`, { channel, ...event });
  } catch {
    // Non-blocking: swallow logger errors to avoid cascading failures
  }
}

// ─── D1 Persistence ──────────────────────────────────────────────────────────

let _env: Env | null = null;

/**
 * Inject the Worker env for D1 persistence.
 * Called once during registerObservability().
 */
export function setObservabilityEnv(env: Env): void {
  _env = env;
}

/**
 * Persist an event to the D1 observability_events table.
 * Non-blocking: errors are swallowed.
 */
function persistToD1(channel: string, event: { type: string; agent: string; name: string; payload: Record<string, unknown>; timestamp: number }): void {
  if (!_env) return;
  try {
    const db = getDb(_env.DB);
    db.insert(observabilityEvents).values({
      channel,
      eventType: event.type,
      agent: event.agent,
      name: event.name,
      payload: JSON.stringify(event.payload).slice(0, 8192),
      eventTimestamp: new Date(event.timestamp).toISOString(),
      capturedAt: new Date().toISOString(),
    }).then(() => {}).catch(() => {});
  } catch {
    // Non-blocking
  }
}

// ─── Channel Subscribers ─────────────────────────────────────────────────────

const unsubscribers: (() => void)[] = [];

/**
 * Register all observability channel subscribers.
 * Idempotent: calling multiple times is safe (prior subscriptions are cleaned up).
 */
export function registerSubscribers(): void {
  // Clean up any prior subscriptions
  for (const unsub of unsubscribers) {
    try { unsub(); } catch { /* ignore */ }
  }
  unsubscribers.length = 0;

  // 1. RPC channel — rpc, rpc:error
  unsubscribers.push(
    subscribe('rpc', (event) => {
      pushEvent('agents:rpc', event as any);
      logEvent('agents:rpc', event as any);
      persistToD1('agents:rpc', event as any);
    })
  );

  // 2. State channel — state:update
  unsubscribers.push(
    subscribe('state', (event) => {
      pushEvent('agents:state', event as any);
      logEvent('agents:state', event as any);
      persistToD1('agents:state', event as any);
    })
  );

  // 3. Lifecycle channel — connect, disconnect, destroy
  unsubscribers.push(
    subscribe('lifecycle', (event) => {
      pushEvent('agents:lifecycle', event as any);
      logEvent('agents:lifecycle', event as any);
      persistToD1('agents:lifecycle', event as any);
    })
  );

  // 4. Schedule channel — schedule:create, schedule:execute, schedule:cancel, etc.
  unsubscribers.push(
    subscribe('schedule', (event) => {
      pushEvent('agents:schedule', event as any);
      logEvent('agents:schedule', event as any);
      persistToD1('agents:schedule', event as any);
    })
  );

  // 5. MCP channel — mcp:client:connect, mcp:client:authorize, etc.
  unsubscribers.push(
    subscribe('mcp', (event) => {
      pushEvent('agents:mcp', event as any);
      logEvent('agents:mcp', event as any);
      persistToD1('agents:mcp', event as any);
    })
  );

  // 6. Message channel — message:request, message:response, tool:result, etc.
  unsubscribers.push(
    subscribe('message', (event) => {
      pushEvent('agents:message', event as any);
      logEvent('agents:message', event as any);
      persistToD1('agents:message', event as any);
    })
  );
}

/**
 * Tear down all subscriptions. Used in testing.
 */
export function teardownSubscribers(): void {
  for (const unsub of unsubscribers) {
    try { unsub(); } catch { /* ignore */ }
  }
  unsubscribers.length = 0;
}
