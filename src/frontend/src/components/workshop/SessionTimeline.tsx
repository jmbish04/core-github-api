import { useEffect, useState } from "react";
import * as LucideIcons from "lucide-react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface TaskEvent {
  id: string;
  projectId: string;
  type: string;
  actor: string;
  content: any;
  createdAt: string;
}

export function SessionTimeline({ projectId }: { projectId: string }) {
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const fetchEvents = async () => {
      try {
        const res = await api.frontend.workshop.project[":id"].events.$get({
          param: { id: projectId }
        });
        if (res.ok && mounted) {
          const data = await res.json();
          setEvents(data.events || []);
        }
      } catch (err) {
        console.error("Failed to fetch events:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchEvents();
    // In a real scenario, this would poll or use a WebSocket.
    const interval = setInterval(fetchEvents, 5000);
    return () => { 
      mounted = false; 
      clearInterval(interval);
    };
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center w-full">
        <LucideIcons.Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center w-full text-zinc-500 border border-dashed border-zinc-800 rounded-lg bg-zinc-900/20">
        <LucideIcons.Clock3 className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">No activity recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-zinc-800 before:to-transparent">
      {events.map((event, i) => {
        const isSystem = event.actor === 'system';
        const Icon = isSystem ? LucideIcons.Bot : LucideIcons.User;

        return (
          <div key={event.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
            {/* Icon marker */}
            <div className={cn(
              "flex items-center justify-center w-10 h-10 rounded-full border-4 border-zinc-950 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow",
              isSystem ? "bg-indigo-500 text-white" : "bg-zinc-700 text-zinc-300"
            )}>
              <Icon className="w-4 h-4" />
            </div>

            {/* Event Card */}
            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900/80 transition-colors shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold text-zinc-200 text-sm capitalize">{event.type}</div>
                <time className="text-xs font-mono text-zinc-500">
                  {new Date(event.createdAt).toLocaleTimeString()}
                </time>
              </div>
              <div className="text-sm text-zinc-400">
                {event.content?.action || "Performed an action."}
              </div>
              
              {/* Optional detailed context block */}
              {event.content?.details && (
                <div className="mt-3 p-3 text-xs font-mono bg-zinc-950 rounded border border-zinc-800 text-zinc-500 break-words">
                  {JSON.stringify(event.content.details)}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
