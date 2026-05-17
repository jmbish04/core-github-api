/**
 * @file frontend/src/context/jules-live-context.tsx
 * @description React context providing a real-time WebSocket feed of Jules
 * AI coding agent events and progress updates.
 *
 * @deprecated Use `useAgenticSession(sessionId, { filter: { types: ['jules.status', 'jules.event'] } })`
 * from `@/hooks/useAgenticSession` for new per-session views. Every Jules
 * webhook is now also published as a typed `jules.status` / `jules.event`
 * SessionEvent into the corresponding AgenticSession DO (derived
 * deterministically from the Jules session id via UUIDv5 on the backend —
 * see `src/backend/src/routes/api/webhooks/jules.ts:julesIdToAgenticSessionId`).
 *
 * The global `<JulesLiveProvider>` wired into `App.tsx` is retained for one
 * release cycle so the existing toast firehose keeps working without a
 * breaking UX change. New code should NOT add `useJulesLive()` consumers
 * — use `useAgenticSession` against a specific Jules session id instead.
 *
 * `JulesLiveProvider` opens a WebSocket connection to `GET /api/webhooks/jules/ws`
 * (backed by the legacy `JulesWebhookBroadcaster` Durable Object) and
 * broadcasts all received events as:
 *   - Sonner toast notifications (surfaced immediately to the user)
 *   - A capped `events[]` array for dashboard display
 *
 * ## Migration path
 *
 * Per-session viewers — read the unified AgenticSession stream:
 *
 * ```tsx
 * import { useAgenticSession } from '@/hooks/useAgenticSession';
 *
 * function JulesSessionPanel({ julesSessionId, apiKey }) {
 *   // Derive the AgenticSession id with the same UUIDv5 mapping the
 *   // backend uses — see julesIdToAgenticSessionId in the webhook route.
 *   const agenticSessionId = uuidv5(julesSessionId, JULES_AGENTIC_NAMESPACE);
 *   const { events, status, publish } = useAgenticSession(agenticSessionId, {
 *     apiKey,
 *     filter: { types: ['jules.status', 'jules.event'] },
 *   });
 *   // ...render events
 * }
 * ```
 *
 * Legacy global firehose (still works today, will be removed):
 *
 * ```tsx
 * <JulesLiveProvider>
 *   <YourApp />
 * </JulesLiveProvider>
 * ```
 *
 * @module Context/JulesLive
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import Cookies from 'js-cookie';
import { handleGlobalSuccess } from '@/lib/success-handler';
import { handleGlobalWarning, handleGlobalInfo } from '@/lib/notification-handler';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Mirrors `JulesLiveMessage` from the backend service types. */
export interface JulesLiveEvent {
  /** ISO timestamp when the event was received by the Worker. */
  ts: string;
  /** Originating Jules session ID. */
  sessionId: string;
  /** Classification of the event. */
  eventType:
    | "blocked"
    | "needs_context"
    | "ready_for_pr"
    | "done"
    | "progress"
    | "info";
  /** Human-readable title for the notification. */
  title: string;
  /** Detailed message content. */
  message: string;
  /** Optional completion percentage (0–100), present for "progress" events. */
  progressPct?: number;
  /** Optional step name for progress events. */
  stepName?: string;
  /** Optional original task summary for additional context. */
  originalTask?: string;
}

interface JulesLiveContextValue {
  /** Received live events (capped at 50, newest first). */
  events: JulesLiveEvent[];
  /** Whether the WebSocket is currently connected. */
  isConnected: boolean;
  /** Clear all stored events. */
  clearEvents: () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const JulesLiveContext = createContext<JulesLiveContextValue | null>(null);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Maximum number of events to retain in the live feed. */
const MAX_EVENTS = 50;

/** Base reconnect delay in milliseconds. Doubles on each failure, capped at 30s. */
const BASE_RECONNECT_MS = 2000;

/**
 * Maps a Jules event type to the appropriate Sonner toast function.
 *
 * @param eventType - Jules lifecycle or progress event classification.
 * @returns The Sonner toast method to use.
 */
function fireToastForEvent(
  eventType: JulesLiveEvent["eventType"],
  title: string,
  description: string,
  duration: number,
): void {
  switch (eventType) {
    case "ready_for_pr":
    case "done":
      handleGlobalSuccess(title, description);
      break;
    case "blocked":
    case "needs_context":
      handleGlobalWarning(title, description, duration);
      break;
    case "progress":
    case "info":
    default:
      handleGlobalInfo(title, description, duration);
      break;
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

/**
 * Provides the Jules live-feed WebSocket context to the application.
 *
 * Manages the WebSocket lifecycle including auto-reconnect with exponential
 * backoff. Unmounts cleanly when the component is removed.
 *
 * @deprecated Prefer `useAgenticSession` with a `jules.*` type filter for
 * new per-session viewers. See the module JSDoc for the migration path.
 *
 * @param children - Child components that consume `useJulesLive()`.
 */
export function JulesLiveProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [events, setEvents] = useState<JulesLiveEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const unmountedRef = useRef(false);

  const clearEvents = useCallback(() => setEvents([]), []);

  /** Ref to hold the connect function for self-referencing reconnect. */
  const connectRef = useRef<() => void>(() => {});

  /**
   * Establishes the WebSocket connection to the Jules live-feed endpoint.
   * Called on mount and after each disconnect.
   */
  const connect = useCallback(() => {
    if (unmountedRef.current) return;

    // Build WebSocket URL — replace http(s) with ws(s)
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const apiKey = Cookies.get('colby_api_key');
    const authParam = apiKey ? `?apiKey=${encodeURIComponent(apiKey)}` : '';
    const wsUrl = `${protocol}//${window.location.host}/api/webhooks/jules/ws${authParam}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmountedRef.current) return;
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;
      console.log("[JulesLive] WebSocket connected");
    };

    ws.onmessage = (ev) => {
      if (unmountedRef.current) return;
      try {
        const event = JSON.parse(ev.data) as JulesLiveEvent;

        // Prepend to events array, capped at MAX_EVENTS
        setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS));

        const description =
          event.eventType === "progress" && event.progressPct != null
            ? `${event.progressPct}% — ${event.message}`
            : event.message;

        const duration =
            event.eventType === "progress" ? 5000 : 12000;

        fireToastForEvent(event.eventType, event.title, description, duration);
      } catch (err) {
        console.warn("[JulesLive] Failed to parse WebSocket message:", err);
      }
    };

    ws.onclose = () => {
      if (unmountedRef.current) return;
      setIsConnected(false);
      wsRef.current = null;

      // Exponential backoff reconnect (max 30s)
      const delay = Math.min(
        BASE_RECONNECT_MS * Math.pow(2, reconnectAttemptsRef.current),
        30_000
      );
      reconnectAttemptsRef.current++;
      console.log(`[JulesLive] WebSocket closed. Reconnecting in ${delay}ms...`);
      reconnectTimerRef.current = setTimeout(() => connectRef.current(), delay);
    };

    ws.onerror = (err) => {
      console.error("[JulesLive] WebSocket error:", err);
      ws.close(); // onerror is always followed by onclose — let that handle reconnect
    };
  }, []);

  // Keep connectRef in sync
  connectRef.current = connect;

  // Mount: open connection
  useEffect(() => {
    unmountedRef.current = false;
    connect();

    // Cleanup on unmount
    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent reconnect after intentional close
        wsRef.current.close();
      }
    };
  }, [connect]);

  return (
    <JulesLiveContext.Provider value={{ events, isConnected, clearEvents }}>
      {children}
    </JulesLiveContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Hook to consume the Jules live-feed context.
 *
 * Must be used inside `<JulesLiveProvider>`.
 *
 * @deprecated Use `useAgenticSession(sessionId, { filter: { types: ['jules.status', 'jules.event'] } })`
 * for per-session viewers. See the module JSDoc for the migration path.
 *
 * @returns `{ events, isConnected, clearEvents }`
 *
 * @throws If used outside `<JulesLiveProvider>`.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useJulesLive(): JulesLiveContextValue {
  const ctx = useContext(JulesLiveContext);
  if (!ctx) {
    throw new Error("useJulesLive must be used inside <JulesLiveProvider>");
  }
  return ctx;
}
