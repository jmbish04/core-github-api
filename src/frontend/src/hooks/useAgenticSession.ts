/**
 * @file hooks/useAgenticSession.ts
 * @description React hook for connecting to AgenticSession WebSocket.
 *   Auto-reconnects with exponential backoff, filters event types, and survives Strict Mode.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────────────────

export type SessionEventType =
  | 'system.start'
  | 'system.complete'
  | 'system.error'
  | 'agent.thought'
  | 'agent.action'
  | 'agent.result'
  | 'hitl.request'
  | 'hitl.response'
  | 'jules.status'
  | 'jules.event'
  | 'user.message';

export interface SessionEvent {
  type: SessionEventType;
  timestamp: number;
  sessionId: string;
  sequenceNum: number;
  payload: Record<string, unknown>;
}

export interface Participant {
  subscriberId: string;
  subscriberType: string;
  connectedAt: number;
}

export interface UseAgenticSessionOptions {
  apiKey: string;
  filter?: {
    types?: SessionEventType[];
  };
  /** Base URL for the worker (defaults to window.location.origin) */
  baseUrl?: string;
}

type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error';

// ── Hook ─────────────────────────────────────────────────────────────────

export function useAgenticSession(
  sessionId: string,
  opts: UseAgenticSessionOptions
) {
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [participants, setParticipants] = useState<Participant[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const reconnectAttemptRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(false);

  // Base URL for API calls
  const baseUrl = opts.baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');

  // ── Fetch participants ───────────────────────────────────────────────
  const fetchParticipants = useCallback(async () => {
    try {
      const response = await fetch(`${baseUrl}/api/sessions/${sessionId}/subscribers`, {
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setParticipants(data.subscribers || []);
      }
    } catch (err) {
      console.error('[useAgenticSession] Failed to fetch participants:', err);
    }
  }, [baseUrl, sessionId, opts.apiKey]);

  // ── Publish event ────────────────────────────────────────────────────
  const publish = useCallback(
    async (event: Omit<SessionEvent, 'sessionId' | 'sequenceNum' | 'timestamp'>) => {
      try {
        const response = await fetch(`${baseUrl}/api/sessions/${sessionId}/events`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${opts.apiKey}`,
          },
          body: JSON.stringify(event),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to publish event: ${response.status} ${errorText}`);
        }
      } catch (err) {
        console.error('[useAgenticSession] Publish failed:', err);
        throw err;
      }
    },
    [baseUrl, sessionId, opts.apiKey]
  );

  // ── Connect with exponential backoff ─────────────────────────────────
  const connect = useCallback(() => {
    if (!isMountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    // Calculate backoff: 1s, 2s, 4s, 8s, max 30s
    const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 30000);
    console.log(`[useAgenticSession] Connecting... (attempt ${reconnectAttemptRef.current + 1}, delay ${delay}ms)`);

    try {
      // Determine WebSocket URL
      const protocol = baseUrl.startsWith('https') ? 'wss' : 'ws';
      const wsUrl = `${protocol}://${baseUrl.replace(/^https?:\/\//, '')}/api/sessions/${sessionId}/ws?token=${encodeURIComponent(opts.apiKey)}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[useAgenticSession] Connected');
        setStatus('open');
        reconnectAttemptRef.current = 0;

        // Fetch participants once connected
        fetchParticipants();
      };

      ws.onclose = () => {
        console.log('[useAgenticSession] Disconnected');
        setStatus('closed');
        wsRef.current = null;

        // Reconnect with exponential backoff
        if (isMountedRef.current) {
          const backoffDelay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 30000);
          reconnectAttemptRef.current++;
          reconnectTimerRef.current = setTimeout(connect, backoffDelay);
        }
      };

      ws.onerror = (error) => {
        console.error('[useAgenticSession] WebSocket error:', error);
        setStatus('error');
      };

      ws.onmessage = (event) => {
        try {
          const data: SessionEvent = JSON.parse(event.data);

          // Apply filter if provided
          if (opts.filter?.types && !opts.filter.types.includes(data.type)) {
            return;
          }

          setEvents((prev) => [...prev, data]);
        } catch (err) {
          console.error('[useAgenticSession] Failed to parse message:', err);
        }
      };
    } catch (err) {
      console.error('[useAgenticSession] Connection failed:', err);
      setStatus('error');

      // Retry with backoff
      if (isMountedRef.current) {
        const backoffDelay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 30000);
        reconnectAttemptRef.current++;
        reconnectTimerRef.current = setTimeout(connect, backoffDelay);
      }
    }
  }, [baseUrl, sessionId, opts.apiKey, opts.filter, fetchParticipants]);

  // ── Mount / unmount ──────────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    connect();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return {
    events,
    status,
    participants,
    publish,
  };
}
