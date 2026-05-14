import { useQuery } from '@tanstack/react-query';

export interface JulesSession {
  id: string;
  status: 'active' | 'completed' | 'failed' | 'waiting_for_user' | 'pending' | string;
  waiting_reason?: 'plan_approval' | 'feedback';
  title?: string;
  description?: string;
  prompt?: string;
  progress_pct?: number;
  current_step_name?: string;
  plan_steps?: string[];
  blocker_message?: string;
  error_message?: string;
  summary?: string;
  repoName?: string;
  projectId?: string;
  createdAt?: string;
  evaluation?: {
    score: number;
    feedback: string;
  };
}

/**
 * Fetches a single Jules session detail by ID.
 *
 * Strategy: Try the merged /history/:id endpoint first (SDK + D1 combined).
 * Falls back to /status/:id?snapshot=true if history returns 404.
 */
export function useJulesSession(sessionId: string | undefined) {
  const query = useQuery<JulesSession>({
    queryKey: ['jules-session', sessionId],
    queryFn: async () => {
      if (!sessionId) throw new Error('No session ID');

      // Primary: merged history endpoint (SDK + D1)
      const historyRes = await fetch(`/api/jules/history/${sessionId}`);
      if (historyRes.ok) {
        const data = await historyRes.json();
        if (data.success && data.session) {
          return data.session as JulesSession;
        }
      }

      // Fallback: direct SDK snapshot
      const statusRes = await fetch(`/api/jules/status/${sessionId}?snapshot=true`);
      if (!statusRes.ok) {
        throw new Error(`Failed to fetch session: ${statusRes.statusText}`);
      }
      const statusData = await statusRes.json();
      const snap = statusData.snapshot || statusData;

      // Normalize SDK snapshot to our JulesSession shape
      let status = snap.state || snap.status || 'unknown';
      if (status === 'inProgress') status = 'active';
      if (status === 'awaitingPlanApproval' || status === 'awaitingUserFeedback') status = 'waiting_for_user';

      return {
        id: sessionId,
        status,
        title: snap.title,
        prompt: snap.prompt,
        createdAt: snap.createTime,
        summary: snap.summary,
        error_message: snap.error_message,
        progress_pct: snap.progress_pct,
        current_step_name: snap.current_step_name,
        plan_steps: snap.plan_steps,
        waiting_reason: snap.waiting_reason,
      } as JulesSession;
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
