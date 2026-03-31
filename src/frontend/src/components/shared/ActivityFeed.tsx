/**
 * @file ActivityFeed.tsx
 * Shared workshop activity feed component.
 * When `events` prop is provided, renders them directly (repo-scoped mode).
 * When omitted, fetches from /api/frontend/workshop/events/recent (global mode).
 */

import { useQuery } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Bot, User, Clock3 } from "lucide-react";

export interface ActivityEvent {
  id: string;
  actor: string;
  type?: string;
  content?: { action?: string };
  projectName?: string;
  createdAt: string;
}

export interface ActivityFeedProps {
  /** Pass events directly (repo-scoped mode). Omit to auto-fetch (global mode). */
  events?: ActivityEvent[];
  /** Max height for the scroll container. Defaults to "flex-1". */
  maxHeight?: string;
  /** Polling interval in ms for auto-fetch mode. Defaults to 10000. */
  refetchInterval?: number;
}

export function ActivityFeed({
  events: externalEvents,
  maxHeight,
  refetchInterval = 10000,
}: ActivityFeedProps) {
  // Only fetch when no external events are provided
  const { data: fetchedEvents, isLoading } = useQuery({
    queryKey: ["workshop", "recent-events"],
    queryFn: async () => {
      const res = await api.frontend.workshop.events.recent.$get({});
      if (!res.ok) return [];
      const ds = await res.json();
      return ds.events as ActivityEvent[];
    },
    refetchInterval,
    enabled: !externalEvents,
  });

  const events = externalEvents ?? fetchedEvents;

  if (!externalEvents && isLoading) {
    return (
      <div className="p-4 flex items-center justify-center text-zinc-500">
        <Clock3 className="animate-spin w-4 h-4 mr-2" />
        Loading...
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div className="p-4 text-xs text-zinc-500">
        No agent activity found.
      </div>
    );
  }

  return (
    <ScrollArea className={cn("flex-1 p-0", maxHeight)}>
      <div className="divide-y divide-zinc-800/50">
        {events.map((event) => {
          const isSystem = event.actor === "system";
          const Icon = isSystem ? Bot : User;
          return (
            <div
              key={event.id}
              className="p-3 text-sm flex gap-3 hover:bg-zinc-800/20 transition-colors"
            >
              <div
                className={cn(
                  "mt-0.5 shrink-0 p-1.5 rounded-md",
                  isSystem
                    ? "bg-indigo-500/20 text-indigo-400"
                    : "bg-zinc-800 text-zinc-400"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-zinc-200 capitalize truncate">
                    {event.projectName || "Draft Project"}
                  </div>
                  <div className="text-[10px] text-zinc-500 shrink-0">
                    {new Date(event.createdAt).toLocaleTimeString([], {
                      timeStyle: "short",
                    })}
                  </div>
                </div>
                <div className="text-zinc-400 text-xs mt-0.5 truncate">
                  {event.type || "Action"}:{" "}
                  {event.content?.action || "Update"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
