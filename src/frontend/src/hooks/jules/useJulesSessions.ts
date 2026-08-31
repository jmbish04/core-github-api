import { useQuery } from '@tanstack/react-query';

export interface JulesSession {
  id: string;
  projectId?: string;
  repoName?: string;
  prompt: string;
  status: 'active' | 'completed' | 'failed' | 'waiting_for_user';
  createdAt: string;
  progress?: number;
}

interface FetchJulesSessionsParams {
  projectId?: string;
  limit?: number;
  page?: number;
}

export function useJulesSessions(params?: FetchJulesSessionsParams) {
  const fetchSessions = async () => {
    const url = new URL('/api/julius/history', window.location.origin);
    if (params?.projectId) {
      url.searchParams.append('projectId', params.projectId);
    }
    if (params?.limit) {
      url.searchParams.append('limit', params.limit.toString());
    }
    if (params?.page) {
      url.searchParams.append('page', params.page.toString());
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error('Failed to fetch sessions');
    }
    return response.json() as Promise<JulesSession[]>;
  };

  const query = useQuery({
    queryKey: ['julesSessions', params],
    queryFn: fetchSessions,
    // Refetch interval: 10s when there are active sessions
    refetchInterval: (data) => {
      if (data && data.some((session) => session.status === 'active')) {
        return 10000;
      }
      return false;
    },
  });

  return {
    sessions: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
