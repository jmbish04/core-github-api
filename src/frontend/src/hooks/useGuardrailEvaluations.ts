import { useQuery } from '@tanstack/react-query';

export type GuardrailEvaluation = {
  requestId: string;
  agentId: string;
  status: string;
  score: number;
  issuesJson: string | null;
  evaluatedAt: string;
};

export function useGuardrailEvaluations(limit: number = 50) {
  return useQuery({
    queryKey: ['guardrail-evaluations', limit],
    queryFn: async () => {
      const res = await fetch(`/api/agents/traceability/guardrail/evaluations?limit=${limit}`);
      if (!res.ok) throw new Error('Failed to fetch evaluations');
      const data = await res.json();
      return (data as any).evaluations as GuardrailEvaluation[];
    },
    refetchInterval: 15000,
  });
}
