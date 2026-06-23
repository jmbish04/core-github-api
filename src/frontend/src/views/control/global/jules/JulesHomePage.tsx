import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useJulesSessions } from '@/hooks/jules/useJulesSessions';
import { Link, useParams } from 'react-router-dom';
import {
  Plus,
  ListTodo,
  Settings,
  Activity,
  CheckCircle2,
  TrendingUp,
  Clock,
  ArrowRight,
} from 'lucide-react';

const statusVariants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'secondary',
  completed: 'default',
  failed: 'destructive',
  waiting_for_user: 'outline',
};

const statusLabels: Record<string, string> = {
  active: 'Active',
  completed: 'Completed',
  failed: 'Failed',
  waiting_for_user: 'Waiting',
};

export function JulesHomePage() {
  const { owner, repo } = useParams<{ owner?: string; repo?: string }>();
  const projectId = owner && repo ? `${owner}/${repo}` : undefined;
  const baseUrl = owner && repo ? `/repos/${owner}/${repo}/jules` : '/jules';
  
  const { sessions, isLoading } = useJulesSessions({ limit: 5, projectId });

  const activeTasks = sessions.filter((s) => s.status === 'active').length;
  const completedToday = sessions.filter((s) => {
    if (s.status !== 'completed') return false;
    const created = new Date(s.createdAt);
    const today = new Date();
    return (
      created.getFullYear() === today.getFullYear() &&
      created.getMonth() === today.getMonth() &&
      created.getDate() === today.getDate()
    );
  }).length;
  const totalCompleted = sessions.filter((s) => s.status === 'completed').length;
  const successRate = sessions.length > 0
    ? Math.round((totalCompleted / sessions.length) * 100)
    : 0;

  return (
    <div className="container max-w-7xl mx-auto py-6 px-4 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Jules Home</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Overview of your automated engineering tasks.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Active Tasks</p>
                <p className="text-3xl font-bold text-zinc-100 mt-1">
                  {isLoading ? '-' : activeTasks}
                </p>
              </div>
              <div className="p-2.5 bg-zinc-900 rounded-lg">
                <Activity className="h-5 w-5 text-zinc-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Completed Today</p>
                <p className="text-3xl font-bold text-zinc-100 mt-1">
                  {isLoading ? '-' : completedToday}
                </p>
              </div>
              <div className="p-2.5 bg-zinc-900 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-zinc-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Success Rate</p>
                <p className="text-3xl font-bold text-zinc-100 mt-1">
                  {isLoading ? '-' : `${successRate}%`}
                </p>
              </div>
              <div className="p-2.5 bg-zinc-900 rounded-lg">
                <TrendingUp className="h-5 w-5 text-zinc-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        <Button asChild className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
          <Link to={`${baseUrl}/tasks/new`}>
            <Plus className="w-4 h-4 mr-2" />
            New Task
          </Link>
        </Button>
        <Button asChild variant="outline" className="border-zinc-700 hover:bg-zinc-800 text-zinc-300">
          <Link to={`${baseUrl}/tasks`}>
            <ListTodo className="w-4 h-4 mr-2" />
            View All Tasks
          </Link>
        </Button>
        <Button asChild variant="outline" className="border-zinc-700 hover:bg-zinc-800 text-zinc-300">
          <Link to={`${baseUrl}/mcp`}>
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </Link>
        </Button>
      </div>

      {/* Recent tasks */}
      <Card className="bg-zinc-950 border-zinc-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium text-zinc-100">Recent Tasks</CardTitle>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="text-zinc-400 hover:text-zinc-200 text-xs"
            >
              <Link to={`${baseUrl}/tasks`}>
                View All
                <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-zinc-900 animate-pulse rounded-lg border border-zinc-800" />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">
              <Clock className="h-8 w-8 mx-auto mb-2 text-zinc-600" />
              <p className="text-sm">No recent tasks. Create one to get started.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.slice(0, 5).map((session) => (
                <Link
                  key={session.id}
                  to={`${baseUrl}/tasks/${session.id}`}
                  className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-colors group"
                >
                  <div className="flex-1 min-w-0 mr-4">
                    <p className="text-sm text-zinc-200 truncate group-hover:text-zinc-100">
                      {session.prompt.length > 80
                        ? `${session.prompt.substring(0, 80)}...`
                        : session.prompt}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
                      {session.repoName && (
                        <span className="font-mono bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                          {session.repoName}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge variant={statusVariants[session.status]} className="shrink-0 text-xs">
                    {statusLabels[session.status]}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default JulesHomePage;
