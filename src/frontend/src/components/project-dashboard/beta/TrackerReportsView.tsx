/**
 * @file TrackerReportsView.tsx
 * @description Analytics dashboard with AI insights alert, metric cards,
 * velocity chart, and team workload breakdown.
 */

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  TrendingUp,
  Users,
  Sparkles,
  Loader2,
  ListChecks,
  Zap,
} from 'lucide-react';
import type { TrackerTask } from './TrackerLayout';

interface TrackerReportsViewProps {
  tasks: TrackerTask[];
  isLoading: boolean;
}

const STATUS_COLORS_HEX: Record<string, string> = {
  backlog: '#71717a',
  todo: '#60a5fa',
  in_progress: '#fbbf24',
  review: '#a78bfa',
  done: '#34d399',
};

export function TrackerReportsView({ tasks, isLoading }: TrackerReportsViewProps) {
  const metrics = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === 'done').length;
    const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
    const critical = tasks.filter((t) => t.priority === 'critical').length;
    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

    // Velocity: tasks completed in last 7 days
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const recentlyDone = tasks.filter(
      (t) => t.status === 'done' && t.endAt && new Date(t.endAt) > weekAgo
    ).length;

    // Avg cycle time (start → end) for done tasks
    const cycleTimes = tasks
      .filter((t) => t.status === 'done' && t.startAt && t.endAt)
      .map((t) => {
        const start = new Date(t.startAt!).getTime();
        const end = new Date(t.endAt!).getTime();
        return (end - start) / (1000 * 60 * 60 * 24); // days
      });
    const avgCycleTime =
      cycleTimes.length > 0
        ? Math.round((cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length) * 10) / 10
        : 0;

    return { total, done, inProgress, critical, completionRate, recentlyDone, avgCycleTime };
  }, [tasks]);

  // Status distribution for pie chart
  const statusDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    tasks.forEach((t) => {
      counts[t.status] = (counts[t.status] || 0) + 1;
    });
    return Object.entries(counts).map(([status, count]) => ({
      name: status.replace('_', ' '),
      value: count,
      color: STATUS_COLORS_HEX[status] || '#71717a',
    }));
  }, [tasks]);

  // Team workload
  const teamWorkload = useMemo(() => {
    const assignees: Record<string, { total: number; done: number; inProgress: number }> = {};
    tasks.forEach((t) => {
      const name = t.assignee || 'Unassigned';
      if (!assignees[name]) assignees[name] = { total: 0, done: 0, inProgress: 0 };
      assignees[name].total++;
      if (t.status === 'done') assignees[name].done++;
      if (t.status === 'in_progress') assignees[name].inProgress++;
    });
    return Object.entries(assignees)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [tasks]);

  // Priority breakdown for bar chart
  const priorityBreakdown = useMemo(() => {
    const priorities = ['low', 'medium', 'high', 'critical'];
    return priorities.map((p) => ({
      priority: p,
      count: tasks.filter((t) => t.priority === p).length,
    }));
  }, [tasks]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 max-w-6xl">
      {/* AI Insights Alert */}
      {metrics.critical > 0 && (
        <Card className="bg-amber-950/20 border-amber-800/30">
          <CardContent className="flex items-center gap-3 py-3">
            <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-200">AI Insight</p>
              <p className="text-xs text-amber-300/80">
                {metrics.critical} critical task{metrics.critical > 1 ? 's' : ''} need attention.
                {metrics.avgCycleTime > 0 &&
                  ` Average cycle time is ${metrics.avgCycleTime} days.`}
                {metrics.completionRate < 50 &&
                  ` Completion rate is only ${metrics.completionRate}% — consider re-prioritizing.`}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          icon={ListChecks}
          label="Total Tasks"
          value={metrics.total}
          color="text-foreground"
        />
        <MetricCard
          icon={CheckCircle2}
          label="Completion"
          value={`${metrics.completionRate}%`}
          sublabel={`${metrics.done} of ${metrics.total}`}
          color="text-emerald-400"
        />
        <MetricCard
          icon={Zap}
          label="Velocity (7d)"
          value={metrics.recentlyDone}
          sublabel="tasks/week"
          color="text-blue-400"
        />
        <MetricCard
          icon={Clock}
          label="Avg Cycle Time"
          value={metrics.avgCycleTime > 0 ? `${metrics.avgCycleTime}d` : '—'}
          sublabel="start → done"
          color="text-amber-400"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Status Distribution Pie */}
        <Card className="bg-zinc-950/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={statusDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  dataKey="value"
                  paddingAngle={2}
                >
                  {statusDistribution.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    border: '1px solid #3f3f46',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Legend
                  formatter={(value: string) => (
                    <span className="text-xs capitalize text-muted-foreground">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Priority Breakdown Bar */}
        <Card className="bg-zinc-950/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-muted-foreground" />
              Priority Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={priorityBreakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="priority" tick={{ fontSize: 11, fill: '#a1a1aa' }} />
                <YAxis tick={{ fontSize: 11, fill: '#a1a1aa' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    border: '1px solid #3f3f46',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="count" fill="#60a5fa" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Team Workload */}
      <Card className="bg-zinc-950/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            Team Workload
          </CardTitle>
        </CardHeader>
        <CardContent>
          {teamWorkload.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              No assignees yet — assign tasks to see workload distribution.
            </p>
          ) : (
            <div className="space-y-3">
              {teamWorkload.map(({ name, total, done, inProgress }) => {
                const progress = total > 0 ? Math.round((done / total) * 100) : 0;
                return (
                  <div key={name} className="flex items-center gap-3">
                    <div className="w-28 truncate text-sm text-foreground">{name}</div>
                    <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground w-40 justify-end">
                      <Badge variant="secondary" className="text-[10px] h-4">
                        {done} done
                      </Badge>
                      <Badge variant="outline" className="text-[10px] h-4">
                        {inProgress} active
                      </Badge>
                      <span className="font-mono">{total}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sublabel,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sublabel?: string;
  color: string;
}) {
  return (
    <Card className="bg-zinc-950/30">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <Icon className={cn('w-5 h-5', color)} />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        </div>
        <div className={cn('text-2xl font-bold', color)}>{value}</div>
        {sublabel && <p className="text-[10px] text-muted-foreground mt-0.5">{sublabel}</p>}
      </CardContent>
    </Card>
  );
}
