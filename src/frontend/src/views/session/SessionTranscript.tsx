/**
 * @file views/session/SessionTranscript.tsx
 * @description Main session transcript view with auto-scrolling live feed.
 *   Uses useAgenticSession hook, aria-live for accessibility, mobile-responsive.
 */

'use client';

import { useEffect, useRef } from 'react';
import { useAgenticSession } from '@/hooks/useAgenticSession';
import { SessionEventCard } from './SessionEventCard';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

interface SessionTranscriptProps {
  sessionId: string;
  apiKey: string;
  /** Optional event type filter */
  filter?: {
    types?: string[];
  };
  /** Auto-scroll to bottom on new events (default: true) */
  autoScroll?: boolean;
}

export function SessionTranscript({
  sessionId,
  apiKey,
  filter,
  autoScroll = true,
}: SessionTranscriptProps) {
  const { events, status, participants } = useAgenticSession(sessionId, {
    apiKey,
    filter: filter as any,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastEventCountRef = useRef<number>(0);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (autoScroll && events.length > lastEventCountRef.current) {
      scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      lastEventCountRef.current = events.length;
    }
  }, [events.length, autoScroll]);

  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div className="flex items-center justify-between p-4 border-b border-border/40">
        <div className="flex items-center space-x-2">
          {status === 'connecting' && (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Connecting...</span>
            </>
          )}
          {status === 'open' && (
            <>
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-sm text-muted-foreground">Live</span>
            </>
          )}
          {status === 'closed' && (
            <>
              <div className="h-2 w-2 rounded-full bg-gray-500" />
              <span className="text-sm text-muted-foreground">Disconnected</span>
            </>
          )}
          {status === 'error' && (
            <>
              <div className="h-2 w-2 rounded-full bg-red-500" />
              <span className="text-sm text-red-500">Connection error</span>
            </>
          )}
        </div>

        <div className="text-sm text-muted-foreground">
          {events.length} events · {participants.length} participants
        </div>
      </div>

      {/* Event feed */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-4"
        aria-live="polite"
        aria-atomic="false"
        aria-relevant="additions"
      >
        {events.length === 0 && status === 'open' && (
          <Alert>
            <AlertDescription>
              Waiting for events... The session is connected and will display events
              as they arrive.
            </AlertDescription>
          </Alert>
        )}

        {events.map((event, index) => (
          <SessionEventCard key={`${event.sessionId}-${event.sequenceNum}-${index}`} event={event} />
        ))}

        {/* Scroll anchor */}
        <div ref={scrollRef} />
      </div>
    </div>
  );
}
