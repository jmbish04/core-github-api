import { useQuery } from '@tanstack/react-query';

export interface JulesSession {
  id: string;
  status: 'active' | 'completed' | 'failed' | 'waiting_for_user' | 'pending';
  waiting_reason?: 'plan_approval' | 'feedback';
  title?: string;
  description?: string;
  progress_pct?: number;
  current_step_name?: string;
  plan_steps?: string[];
  blocker_message?: string;
  error_message?: string;
  summary?: string;
  evaluation?: {
    score: number;
    feedback: string;
  };
}

export function useJulesSession(sessionId: string | undefined) {
  const query = useQuery<JulesSession>({
    queryKey: ['jules-session', sessionId],
    queryFn: async () => {
      if (!sessionId) throw new Error('No session ID');
      const res = await fetch(`/api/julius/status/${sessionId}?snapshot=true`);
      if (!res.ok) {
        throw new Error(`Failed to fetch session: ${res.statusText}`);
      }
      return res.json();
    },
    enabled: !!sessionId,
    refetchInterval: (data) => {
      // Refresh every 5s if active or waiting for user
      if (data?.status === 'active' || data?.status === 'waiting_for_user') {
        return 5000;
      }
      return false;
    },
  });

  return {
    session: query.data,
    isLoading: query.isLoading,
    error: query.error,
  };
}
