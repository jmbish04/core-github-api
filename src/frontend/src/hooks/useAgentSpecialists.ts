import { useQuery } from '@tanstack/react-query';

export type SpecialistAgent = {
  id: string;
  name: string;
  subtitle: string;
  icon: string;
  status: "online" | "busy" | "offline";
};

export function useAgentSpecialists() {
  return useQuery({
    queryKey: ['agent-specialists'],
    queryFn: async () => {
      // using raw fetch since api.agents.specialists might not be fully typed in the hc client yet
      const res = await fetch('/api/agents/specialists');
      if (!res.ok) throw new Error('Failed to fetch specialist agents');
      const data = await res.json();
      return (data as any).agents as SpecialistAgent[];
    },
    staleTime: 60000, // 1 minute
  });
}
