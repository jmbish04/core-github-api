/**
 * @file src/frontend/src/hooks/useAgentsRegistry.ts
 * @description React hook that fetches the agent registry from the D1-backed API using React Query.
 * Replaces the static AGENTS array previously hardcoded in agents-registry.ts.
 */
import { useQuery } from '@tanstack/react-query';

export interface AgentEntry {
  id: string;
  name: string;
  description: string;
  tags: string[];
  iconName: string;       // lucide-react icon name, e.g. "Sparkles"
  iconBg: string;         // tailwind class for icon background
  iconColor: string;      // tailwind class for icon colour
  workshopUrl?: string;
  docsSlug?: string;
  sortOrder: number;
}

interface UseAgentsRegistry {
  agents: AgentEntry[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAgentsRegistry(): UseAgentsRegistry {
  const { data, isLoading, error, refetch } = useQuery<{ agents: AgentEntry[] }, Error>({
    queryKey: ['docs-agents'],
    queryFn: async () => {
      const res = await fetch('/api/docs/agents');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });

  return {
    agents: data?.agents ?? [],
    loading: isLoading,
    error: error ? error.message : null,
    refetch: () => { refetch(); },
  };
}
