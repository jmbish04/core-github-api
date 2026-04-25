import { peekRecentEvents, type ObservabilityEvent } from '../observability';

/**
 * Captures a point-in-time snapshot of recent observability events
 * from the process-scope ring buffer to append to health probe reports.
 * Does not drain or mutate the buffer.
 */
export function captureRecentEvents(): { recentRpcErrors: ObservabilityEvent[]; recentMcpEvents: ObservabilityEvent[] } {
  const events = peekRecentEvents();
  
  return {
    recentRpcErrors: events.filter(e => e.channel === 'rpc:error'),
    recentMcpEvents: events.filter(e => e.channel === 'mcp:client:connect' || e.channel === 'mcp:client:error')
  };
}
