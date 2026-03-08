import { useEffect, useState, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Radio, RefreshCcw, Wifi, WifiOff } from "lucide-react";
import { EventCard, type StoredEvent, type AutomationRunInfo } from "./EventCard";
import { useColbySocket } from "@/hooks/useColbySocket";

// ── Types ───────────────────────────────────────────────────────

interface ConfigResponse {
  owner: string;
  features: { automations: boolean; liveEvents: boolean };
}

// ── Component ───────────────────────────────────────────────────

export function LiveEventsTab() {
  const queryClient = useQueryClient();
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [automationRunsMap, setAutomationRunsMap] = useState<Record<string, AutomationRunInfo[]>>({});
  const eventsRef = useRef<StoredEvent[]>([]);

  // 1. Fetch config to determine owner name
  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ["api-config"],
    queryFn: async () => {
      const res = await fetch("/api/config");
      if (!res.ok) throw new Error("Failed to fetch config");
      return res.json() as Promise<ConfigResponse>;
    },
    staleTime: 60_000,
  });

  const ownerName = config?.owner || "";

  // 2. Fetch initial events via REST polling
  const { data: initialEvents, isLoading: eventsLoading, refetch } = useQuery({
    queryKey: ["owner-events", ownerName],
    queryFn: async () => {
      if (!ownerName) return [];
      // Call OwnerAgent's getEvents callable via agents framework
      // Since we can't directly call @callable from the frontend,
      // we'll use a REST endpoint that proxies to the OwnerAgent
      const res = await fetch(`/api/webhooks/live-events?owner=${encodeURIComponent(ownerName)}&limit=50`);
      if (!res.ok) {
        // Fallback: if the endpoint doesn't exist yet, return empty
        console.warn("Live events endpoint not available yet");
        return [];
      }
      return res.json() as Promise<StoredEvent[]>;
    },
    enabled: !!ownerName,
    refetchInterval: 10_000, // Poll every 10 seconds as fallback
  });

  // Merge initial events
  useEffect(() => {
    if (initialEvents && initialEvents.length > 0) {
      setEvents((prev) => {
        const existingIds = new Set(prev.map((e) => e.id));
        const newEvents = initialEvents.filter((e: StoredEvent) => !existingIds.has(e.id));
        const merged = [...newEvents, ...prev].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        eventsRef.current = merged.slice(0, 200); // Keep last 200
        return eventsRef.current;
      });
    }
  }, [initialEvents]);

  // 3. WebSocket for real-time updates (optional enhancement)
  const wsUrl = ownerName
    ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws?projectId=owner-${ownerName}`
    : "";

  const handleWsMessage = useCallback((data: any) => {
    if (data?.type === "event" && data.event) {
      const newEvent = data.event as StoredEvent;
      setEvents((prev) => {
        if (prev.some((e) => e.id === newEvent.id)) return prev;
        const updated = [newEvent, ...prev].slice(0, 200);
        eventsRef.current = updated;
        return updated;
      });

      // If automation runs come with the event
      if (data.automationRuns && data.automationRuns.length > 0) {
        setAutomationRunsMap((prev) => ({
          ...prev,
          [newEvent.id]: data.automationRuns,
        }));
      }
    }
  }, []);

  const { isConnected } = useColbySocket({
    url: wsUrl,
    onMessage: handleWsMessage,
    autoConnect: !!wsUrl,
    reconnectInterval: 5000,
  });

  // Fetch automation runs for visible events
  useEffect(() => {
    if (!config?.features.automations) return;

    const fetchRuns = async () => {
      // For the first 20 visible events, check for automation runs
      const visibleEvents = events.slice(0, 20);
      const toFetch = visibleEvents.filter((e) => !(e.id in automationRunsMap));

      if (toFetch.length === 0) return;

      for (const event of toFetch) {
        try {
          const res = await fetch(
            `/api/webhooks/automation-runs?eventId=${encodeURIComponent(event.id)}&owner=${encodeURIComponent(ownerName)}`
          );
          if (res.ok) {
            const runs = ((await res.json()) as any) as AutomationRunInfo[];
            if (runs.length > 0) {
              setAutomationRunsMap((prev) => ({ ...prev, [event.id]: runs }));
            } else {
              setAutomationRunsMap((prev) => ({ ...prev, [event.id]: [] }));
            }
          }
        } catch {
          // Endpoint may not exist yet, silently skip
        }
      }
    };

    const timer = setTimeout(fetchRuns, 500);
    return () => clearTimeout(timer);
  }, [events, ownerName, config?.features.automations, automationRunsMap]);

  // ── Render ──────────────────────────────────────────────────────

  if (configLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!ownerName) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
        <Radio className="size-8" />
        <p className="text-sm">No GITHUB_OWNER configured.</p>
        <p className="text-xs">Set the GITHUB_OWNER environment variable to enable live events.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {isConnected ? (
              <Wifi className="size-4 text-green-400" />
            ) : (
              <WifiOff className="size-4 text-red-400" />
            )}
            <span className="text-xs text-muted-foreground">
              {isConnected ? "Connected" : "Polling"}
            </span>
          </div>
          <Badge variant="outline" className="font-mono text-xs">
            {ownerName}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {events.length} events
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={eventsLoading}
        >
          <RefreshCcw className={`size-3.5 mr-1.5 ${eventsLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Events feed */}
      {eventsLoading && events.length === 0 ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : events.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
          <Radio className="size-8" />
          <p className="text-sm">No events yet.</p>
          <p className="text-xs">Events will appear here as they arrive from GitHub.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              automationRuns={automationRunsMap[event.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
