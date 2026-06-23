import { useQuery } from '@tanstack/react-query';

export interface InsightSession {
  id: string;
  projectId: string | null;
  prompt: string;
  status: string;
  repoOwner: string | null;
  repoName: string | null;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  assistanceCount: number;
  specialistClass: string | null;
  sessionRole: string | null;
}

export interface AgentMetrics {
  sessionsToday: number;
  successRate: number;
  avgDurationMinutes: number;
  activeNow: number;
}

export interface SessionTimelineEntry {
  time: string;
  successful: number;
  failed: number;
}

export interface SessionOutcomeEntry {
  name: string;
  value: number;
}

interface HistoryResponse {
  success: boolean;
  sessions: InsightSession[];
  page: number;
  limit: number;
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function computeMetrics(sessions: InsightSession[]): AgentMetrics {
  const sessionsToday = sessions.filter((s) => isToday(s.createdAt)).length;
  const completed = sessions.filter((s) => s.status === 'completed').length;
  const failed = sessions.filter((s) => s.status === 'failed').length;
  const total = completed + failed;
  const successRate = total > 0 ? (completed / total) * 100 : 0;

  const durations = sessions
    .filter((s) => s.status === 'completed')
    .map((s) => {
      const start = new Date(s.createdAt).getTime();
      const end = new Date(s.updatedAt).getTime();
      return (end - start) / 1000 / 60;
    })
    .filter((d) => d > 0 && d < 1440);

  const avgDurationMinutes =
    durations.length > 0
      ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10
      : 0;

  const activeNow = sessions.filter((s) => s.status === 'active').length;

  return { sessionsToday, successRate, avgDurationMinutes, activeNow };
}

function computeTimeline(sessions: InsightSession[]): SessionTimelineEntry[] {
  const buckets: Record<string, { successful: number; failed: number }> = {};
  const hours = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'];
  hours.forEach((h) => { buckets[h] = { successful: 0, failed: 0 }; });

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  for (const s of sessions) {
    const d = new Date(s.createdAt);
    if (d < oneDayAgo) continue;
    const hour = Math.floor(d.getHours() / 4) * 4;
    const key = `${String(hour).padStart(2, '0')}:00`;
    if (buckets[key]) {
      if (s.status === 'completed') buckets[key].successful++;
      else if (s.status === 'failed') buckets[key].failed++;
    }
  }

  return hours.map((h) => ({ time: h, ...buckets[h] }));
}

function computeOutcomes(sessions: InsightSession[]): SessionOutcomeEntry[] {
  const completed = sessions.filter((s) => s.status === 'completed').length;
  const failed = sessions.filter((s) => s.status === 'failed').length;
  return [
    { name: 'Success', value: completed },
    { name: 'Failed', value: failed },
  ];
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

export function useAgentInsights() {
  const query = useQuery<HistoryResponse>({
    queryKey: ['agent-insights'],
    queryFn: async () => {
      const res = await fetch('/api/julius/history?limit=100');
      if (!res.ok) throw new Error(`Failed to fetch session history: ${res.statusText}`);
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const sessions = query.data?.sessions || [];
  const metrics = computeMetrics(sessions);
  const timelineData = computeTimeline(sessions);
  const outcomeData = computeOutcomes(sessions);

  const recentSessions = sessions.slice(0, 20).map((s) => {
    const start = new Date(s.createdAt).getTime();
    const end = new Date(s.updatedAt).getTime();
    const durationMs = end - start;
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);

    return {
      id: s.id,
      repo: s.repoOwner && s.repoName ? `${s.repoOwner}/${s.repoName}` : s.projectId || 'N/A',
      status: s.status === 'completed' ? 'success' as const
        : s.status === 'failed' ? 'failed' as const
        : s.status === 'active' ? 'in_progress' as const
        : 'unknown' as const,
      duration: `${minutes}m ${String(seconds).padStart(2, '0')}s`,
      startedAt: formatRelativeTime(s.createdAt),
    };
  });

  return {
    sessions: recentSessions,
    metrics,
    timelineData,
    outcomeData,
    isLoading: query.isLoading,
    error: query.error,
  };
}
