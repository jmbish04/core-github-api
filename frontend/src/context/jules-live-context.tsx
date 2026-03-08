/**
 * @file frontend/src/context/jules-live-context.tsx
 * @description React context providing a real-time WebSocket feed of Jules
 * AI coding agent events and progress updates.
 *
 * `JulesLiveProvider` opens a WebSocket connection to `GET /api/webhooks/jules/ws`
 * (backed by the `JulesWebhookBroadcaster` Durable Object) and broadcasts
 * all received events as:
 *   - Sonner toast notifications (surfaced immediately to the user)
 *   - A capped `events[]` array for dashboard display
 *
 * ## Usage
 *
 * Wrap your app with `<JulesLiveProvider>` inside `<AlertsProvider>`:
 *
 * ```tsx
 * <JulesLiveProvider>
 *   <YourApp />
 * </JulesLiveProvider>
 * ```
 *
 * Consume from any component:
 *
 * ```tsx
 * const { events, isConnected, clearEvents } = useJulesLive();
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
import { toast } from "sonner";

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
function toastForEvent(
  eventType: JulesLiveEvent["eventType"]
): (title: string, opts?: any) => void {
  switch (eventType) {
    case "ready_for_pr":
    case "done":
      return toast.success;
    case "blocked":
    case "needs_context":
      return toast.warning;
    case "progress":
    case "info":
    default:
      return toast.info;
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

/**
 * Provides the Jules live-feed WebSocket context to the application.
 *
 * Manages the WebSocket lifecycle including auto-reconnect with exponential
 * backoff. Unmounts cleanly when the component is removed.
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

  /**
   * Establishes the WebSocket connection to the Jules live-feed endpoint.
   * Called on mount and after each disconnect.
   */
  const connect = useCallback(() => {
    if (unmountedRef.current) return;

    // Build WebSocket URL — replace http(s) with ws(s)
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/webhooks/jules/ws`;

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

        // Fire the appropriate Sonner toast
        const showToast = toastForEvent(event.eventType);
        const description =
          event.eventType === "progress" && event.progressPct != null
            ? `${event.progressPct}% — ${event.message}`
            : event.message;

        showToast(event.title, {
          description,
          duration:
            event.eventType === "progress" ? 5000 : 12000,
          action:
            event.eventType === "ready_for_pr" || event.eventType === "done"
              ? { label: "View Sessions", onClick: () => (window.location.href = "/jules") }
              : undefined,
        });
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
      reconnectTimerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = (err) => {
      console.error("[JulesLive] WebSocket error:", err);
      ws.close(); // onerror is always followed by onclose — let that handle reconnect
    };
  }, []);

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
 * @returns `{ events, isConnected, clearEvents }`
 *
 * @throws If used outside `<JulesLiveProvider>`.
 */
export function useJulesLive(): JulesLiveContextValue {
  const ctx = useContext(JulesLiveContext);
  if (!ctx) {
    throw new Error("useJulesLive must be used inside <JulesLiveProvider>");
  }
  return ctx;
}
