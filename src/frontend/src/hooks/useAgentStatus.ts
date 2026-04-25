import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export type AgentStatusType = {
  id: string;
  agentType: string;
  agentId: string;
  stateJson: string;
  updatedAt: string;
};

export function useAgentStatus() {
  return useQuery({
    queryKey: ['agent-status'],
    queryFn: async () => {
      const res = await api.agents.status.$get();
      if (!res.ok) throw new Error('Failed to fetch agent statuses');
      const data = await res.json();
      return (data as any).statuses as AgentStatusType[]; // Type assertion for initial implementation
    },
    refetchInterval: 10000, // Poll every 10s
  });
}
