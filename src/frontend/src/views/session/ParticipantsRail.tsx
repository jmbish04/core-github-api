/**
 * @file views/session/ParticipantsRail.tsx
 * @description Right-side rail showing active session participants.
 *   Uses shadcn Card with ring-1 ring-border/40, dark theme.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { Participant } from '@/hooks/useAgenticSession';
import { formatDistanceToNow } from 'date-fns';

interface ParticipantsRailProps {
  participants: Participant[];
}

export function ParticipantsRail({ participants }: ParticipantsRailProps) {
  return (
    <Card className="ring-1 ring-border/40">
      <CardHeader>
        <CardTitle className="text-lg">Participants</CardTitle>
        <p className="text-sm text-muted-foreground">
          {participants.length} active
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {participants.length === 0 && (
            <p className="text-sm text-muted-foreground">No active participants</p>
          )}

          {participants.map((participant) => (
            <div
              key={participant.subscriberId}
              className="flex items-start space-x-3"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs">
                  {getInitials(participant.subscriberId)}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium leading-none">
                    {participant.subscriberId}
                  </p>
                  <Badge variant="outline" className="text-xs">
                    {participant.subscriberType}
                  </Badge>
                </div>

                <p className="text-xs text-muted-foreground">
                  Connected{' '}
                  {formatDistanceToNow(new Date(participant.connectedAt), {
                    addSuffix: true,
                  })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function getInitials(subscriberId: string): string {
  const parts = subscriberId.split(':');
  const name = parts[parts.length - 1];

  if (name.length === 0) return '?';
  if (name.length === 1) return name.toUpperCase();

  // Return first two characters
  return name.substring(0, 2).toUpperCase();
}
