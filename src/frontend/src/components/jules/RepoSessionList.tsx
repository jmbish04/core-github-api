import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { Clock, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface RepoSession {
  id: string;
  prompt: string;
  status: 'active' | 'completed' | 'failed' | 'waiting_for_user';
  createdAt: string;
  duration?: string;
}

interface RepoSessionListProps {
  sessions: RepoSession[];
  baseUrl?: string;
}

const statusConfig: Record<string, { label: string; icon: React.ReactNode; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  active: { label: 'Active', icon: <Loader2 className="h-3 w-3 animate-spin" />, variant: 'secondary' },
  completed: { label: 'Completed', icon: <CheckCircle2 className="h-3 w-3" />, variant: 'default' },
  failed: { label: 'Failed', icon: <AlertCircle className="h-3 w-3" />, variant: 'destructive' },
  waiting_for_user: { label: 'Waiting', icon: <Clock className="h-3 w-3" />, variant: 'outline' },
};

export function RepoSessionList({ sessions, baseUrl = '/jules/tasks' }: RepoSessionListProps) {
  if (sessions.length === 0) {
    return (
      <p className="text-sm text-zinc-500 py-2">No recent sessions for this repository.</p>
    );
  }

  return (
    <div className="space-y-2">
      {sessions.map((session) => {
        const config = statusConfig[session.status] || statusConfig.completed;
        const truncated = session.prompt.length > 100
          ? `${session.prompt.substring(0, 100)}...`
          : session.prompt;

        return (
          <Link
            key={session.id}
            to={`${baseUrl}/${session.id}`}
            className="flex items-center justify-between p-3 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-zinc-700 transition-colors group"
          >
            <div className="flex-1 min-w-0 mr-4">
              <p className="text-sm text-zinc-200 truncate group-hover:text-zinc-100">
                {truncated}
              </p>
              <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
                <Clock className="h-3 w-3" />
                <span>{session.createdAt}</span>
                {session.duration && (
                  <>
                    <span>-</span>
                    <span>{session.duration}</span>
                  </>
                )}
              </div>
            </div>
            <Badge variant={config.variant} className="shrink-0 gap-1 text-xs">
              {config.icon}
              {config.label}
            </Badge>
          </Link>
        );
      })}
    </div>
  );
}
