import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';

interface TimelineEvent {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
}

export function TaskTimeline({ sessionId }: { sessionId: string }) {
  const { data: events, isLoading, error } = useQuery<TimelineEvent[]>({
    queryKey: ['jules-history', sessionId],
    queryFn: async () => {
      const res = await fetch(`/api/jules/history/${sessionId}`);
      if (!res.ok) {
        throw new Error('Failed to fetch timeline history');
      }
      const data = await res.json();
      const rawEvents = data.events || [];
      return rawEvents.map((e: any) => ({
        id: e.id || e.name || Math.random().toString(),
        timestamp: e.createTime || e.createdAt,
        type: e.type === 'sessionFailed' ? 'error' : (e.type === 'sessionCompleted' ? 'success' : 'info'),
        message: e.summary || e.message || e.type || e.eventType
      }));
    },
    enabled: !!sessionId,
  });

  if (isLoading) {
    return (
      <Card className="p-8 bg-zinc-900 border-zinc-800 space-y-4">
        <Skeleton className="h-12 w-full bg-zinc-800" />
        <Skeleton className="h-12 w-full bg-zinc-800" />
        <Skeleton className="h-12 w-full bg-zinc-800" />
      </Card>
    );
  }

  if (error || !events) {
    return (
      <Card className="p-8 text-center bg-zinc-900 border-zinc-800 text-red-400">
        Could not load activity timeline.
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card className="p-8 text-center bg-zinc-900 border-zinc-800 text-zinc-500">
        No activity logged yet.
      </Card>
    );
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      default:
        return <Clock className="h-5 w-5 text-zinc-500" />;
    }
  };

  return (
    <Card className="p-8 bg-zinc-900 border-zinc-800">
      <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-zinc-800 before:to-transparent">
        {events.map((event, index) => (
          <div key={event.id || index} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
            <div className="flex items-center justify-center w-10 h-10 rounded-full border border-zinc-800 bg-zinc-950 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
              {getIcon(event.type)}
            </div>
            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-zinc-950 p-4 rounded border border-zinc-800 shadow">
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-semibold uppercase tracking-wider ${
                  event.type === 'success' ? 'text-green-500' :
                  event.type === 'error' ? 'text-red-500' :
                  event.type === 'warning' ? 'text-amber-500' :
                  'text-zinc-500'
                }`}>
                  {event.type}
                </span>
                <span className="text-xs text-zinc-600 font-mono">
                  {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed mt-2">{event.message}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
