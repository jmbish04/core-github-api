import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { TaskStatusBadge } from './TaskStatusBadge';
import { Link } from 'react-router-dom';
import { Progress } from '@/components/ui/progress';
import { JulesSession } from '@/hooks/jules/useJulesSessions';

interface TaskCardProps {
  session: JulesSession;
  baseUrl?: string;
}

export function TaskCard({ session, baseUrl = '/jules/tasks' }: TaskCardProps) {
  const truncatedPrompt = session.prompt.length > 80 
    ? `${session.prompt.substring(0, 80)}...` 
    : session.prompt;

  // Simple relative time approximation
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const timeDiff = new Date(session.createdAt).getTime() - Date.now();
  const diffDays = Math.round(timeDiff / (1000 * 60 * 60 * 24));
  const diffHours = Math.round(timeDiff / (1000 * 60 * 60));
  const diffMins = Math.round(timeDiff / (1000 * 60));
  
  let relativeTime = '';
  if (Math.abs(diffDays) > 0) {
    relativeTime = rtf.format(diffDays, 'day');
  } else if (Math.abs(diffHours) > 0) {
    relativeTime = rtf.format(diffHours, 'hour');
  } else if (Math.abs(diffMins) > 0) {
    relativeTime = rtf.format(diffMins, 'minute');
  } else {
    relativeTime = 'just now';
  }

  return (
    <Link to={`${baseUrl}/${session.id}`} className="block transition-transform hover:-translate-y-1">
      <Card className="hover:border-primary/50 bg-zinc-950 border-zinc-800 transition-colors">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start gap-4">
            <CardTitle className="text-base font-medium line-clamp-2 leading-tight">
              {truncatedPrompt}
            </CardTitle>
            <TaskStatusBadge status={session.status} className="shrink-0" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-xs text-zinc-400 mt-1">
            {session.repoName && (
              <>
                <span className="font-mono bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                  {session.repoName}
                </span>
                <span>•</span>
              </>
            )}
            <span>{relativeTime}</span>
          </div>
          
          {session.status === 'active' && session.progress !== undefined && (
            <div className="mt-4 space-y-1.5">
              <div className="flex justify-between text-xs text-zinc-500">
                <span>In progress</span>
                <span>{session.progress}%</span>
              </div>
              <Progress value={session.progress} className="h-1.5" />
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
