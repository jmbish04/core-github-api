/**
 * @file views/session/SessionEventCard.tsx
 * @description Renders a single SessionEvent as a card.
 *   Uses shadcn Card component with dark theme, ring-1 ring-border/40 separators.
 */

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { SessionEvent } from '@/hooks/useAgenticSession';
import { formatDistanceToNow } from 'date-fns';

interface SessionEventCardProps {
  event: SessionEvent;
}

export function SessionEventCard({ event }: SessionEventCardProps) {
  // Format timestamp
  const timeAgo = formatDistanceToNow(new Date(event.timestamp), { addSuffix: true });

  // Get event type badge color
  const getEventTypeColor = (type: string): string => {
    if (type.startsWith('system.')) return 'bg-blue-500/10 text-blue-500';
    if (type.startsWith('agent.')) return 'bg-green-500/10 text-green-500';
    if (type.startsWith('hitl.')) return 'bg-yellow-500/10 text-yellow-500';
    if (type.startsWith('jules.')) return 'bg-purple-500/10 text-purple-500';
    if (type.startsWith('user.')) return 'bg-orange-500/10 text-orange-500';
    return 'bg-gray-500/10 text-gray-500';
  };

  return (
    <Card className="ring-1 ring-border/40">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Badge variant="outline" className={getEventTypeColor(event.type)}>
          {event.type}
        </Badge>
        <span className="text-xs text-muted-foreground">{timeAgo}</span>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {/* Sequence number */}
          <div className="text-xs text-muted-foreground">
            Sequence #{event.sequenceNum}
          </div>

          {/* Payload rendering (type-specific) */}
          {renderPayload(event)}
        </div>
      </CardContent>
    </Card>
  );
}

function renderPayload(event: SessionEvent) {
  const { type, payload } = event;

  switch (type) {
    case 'system.start':
      return (
        <div>
          <p className="text-sm font-medium">Session started</p>
          {payload.sessionName && (
            <p className="text-sm text-muted-foreground">{payload.sessionName as string}</p>
          )}
        </div>
      );

    case 'system.complete':
      return (
        <div>
          <p className="text-sm font-medium">Session completed</p>
          <p className="text-sm text-muted-foreground">
            Status: {payload.status as string}
          </p>
          {payload.summary && (
            <p className="text-sm mt-2">{payload.summary as string}</p>
          )}
        </div>
      );

    case 'system.error':
      return (
        <div>
          <p className="text-sm font-medium text-red-500">Error</p>
          <p className="text-sm text-muted-foreground">{payload.error as string}</p>
        </div>
      );

    case 'agent.thought':
      return (
        <div>
          <p className="text-sm font-medium">
            {payload.agentName as string || payload.agentId as string}
          </p>
          <p className="text-sm mt-1">{payload.thought as string}</p>
          {payload.reasoning && (
            <p className="text-xs text-muted-foreground mt-1">
              {payload.reasoning as string}
            </p>
          )}
        </div>
      );

    case 'agent.action':
      return (
        <div>
          <p className="text-sm font-medium">
            {payload.agentName as string || payload.agentId as string}
          </p>
          <p className="text-sm mt-1">Action: {payload.action as string}</p>
          {payload.tool && (
            <p className="text-xs text-muted-foreground mt-1">
              Tool: {payload.tool as string}
            </p>
          )}
        </div>
      );

    case 'agent.result':
      return (
        <div>
          <p className="text-sm font-medium">
            {payload.agentName as string || payload.agentId as string}
          </p>
          <p className="text-sm mt-1">
            Result: {payload.success ? '✓ Success' : '✗ Failed'}
          </p>
          {payload.error && (
            <p className="text-xs text-red-500 mt-1">{payload.error as string}</p>
          )}
        </div>
      );

    case 'hitl.request':
      return (
        <div>
          <p className="text-sm font-medium">Human input requested</p>
          <p className="text-sm mt-1">{payload.prompt as string}</p>
          {payload.options && Array.isArray(payload.options) && (
            <ul className="list-disc list-inside text-xs text-muted-foreground mt-1">
              {(payload.options as string[]).map((opt, i) => (
                <li key={i}>{opt}</li>
              ))}
            </ul>
          )}
        </div>
      );

    case 'hitl.response':
      return (
        <div>
          <p className="text-sm font-medium">Human response</p>
          <p className="text-sm mt-1">
            {payload.approved ? '✓ Approved' : '✗ Rejected'}
          </p>
          {payload.response && (
            <p className="text-sm text-muted-foreground mt-1">
              {JSON.stringify(payload.response)}
            </p>
          )}
        </div>
      );

    case 'jules.status':
      return (
        <div>
          <p className="text-sm font-medium">Jules status</p>
          <p className="text-sm mt-1">Status: {payload.status as string}</p>
          {payload.message && (
            <p className="text-sm text-muted-foreground mt-1">
              {payload.message as string}
            </p>
          )}
          {typeof payload.progress === 'number' && (
            <p className="text-xs text-muted-foreground mt-1">
              Progress: {payload.progress}%
            </p>
          )}
        </div>
      );

    case 'jules.event':
      return (
        <div>
          <p className="text-sm font-medium">Jules event</p>
          <p className="text-sm mt-1">{payload.eventType as string}</p>
          <pre className="text-xs text-muted-foreground mt-1 overflow-x-auto">
            {JSON.stringify(payload.data, null, 2)}
          </pre>
        </div>
      );

    case 'user.message':
      return (
        <div>
          <p className="text-sm font-medium">User message</p>
          <p className="text-sm mt-1">{payload.message as string}</p>
        </div>
      );

    default:
      return (
        <pre className="text-xs text-muted-foreground overflow-x-auto">
          {JSON.stringify(payload, null, 2)}
        </pre>
      );
  }
}
