import { useQuery } from '@tanstack/react-query';

interface JulesSession {
  id: string;
  projectId: string | null;
  prompt: string;
  status: string;
  repoOwner: string | null;
  repoName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RepoSession {
  id: string;
  prompt: string;
  status: 'active' | 'completed' | 'failed' | 'waiting_for_user';
  createdAt: string;
  duration?: string;
}

export interface GitHubRepo {
  name: string;
  fullName: string;
  defaultBranch: string;
  totalSessions: number;
  activeSessions: number;
  lastActivity: string;
  sessions: RepoSession[];
}

interface HistoryResponse {
  success: boolean;
  sessions: JulesSession[];
  page: number;
  limit: number;
}

function formatDuration(startStr: string, endStr: string): string {
  const start = new Date(startStr).getTime();
  const end = new Date(endStr).getTime();
  const diffMs = end - start;
  const minutes = Math.floor(diffMs / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000);
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
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

function groupByRepo(sessions: JulesSession[]): GitHubRepo[] {
  const repoMap = new Map<string, { owner: string; name: string; sessions: JulesSession[] }>();

  for (const s of sessions) {
    if (!s.repoOwner || !s.repoName) continue;
    const key = `${s.repoOwner}/${s.repoName}`;
    if (!repoMap.has(key)) {
      repoMap.set(key, { owner: s.repoOwner, name: s.repoName, sessions: [] });
    }
    repoMap.get(key)!.sessions.push(s);
  }

  return Array.from(repoMap.entries()).map(([fullName, data]) => {
    const sortedSessions = data.sessions.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const mappedSessions: RepoSession[] = sortedSessions.map((s) => ({
      id: s.id,
      prompt: s.prompt,
      status: s.status as RepoSession['status'],
      createdAt: formatRelativeTime(s.createdAt),
      duration: formatDuration(s.createdAt, s.updatedAt),
    }));

    return {
      name: data.name,
      fullName,
      defaultBranch: 'main',
      totalSessions: mappedSessions.length,
      activeSessions: mappedSessions.filter((s) => s.status === 'active').length,
      lastActivity: sortedSessions[0] ? formatRelativeTime(sortedSessions[0].createdAt) : 'never',
      sessions: mappedSessions,
    };
  });
}

export function useJulesGitHub() {
  const query = useQuery<HistoryResponse>({
    queryKey: ['jules-github-repos'],
    queryFn: async () => {
      const res = await fetch('/api/julius/history?limit=100');
      if (!res.ok) throw new Error(`Failed to fetch session history: ${res.statusText}`);
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const sessions = query.data?.sessions || [];
  const repos = groupByRepo(sessions);

  return {
    repos,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
