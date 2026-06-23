import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface Skill {
  id: string;
  name: string;
  description: string;
  markdownContent: string;
  githubPath: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useSkills() {
  const query = useQuery<Skill[]>({
    queryKey: ['skills'],
    queryFn: async () => {
      const res = await fetch('/api/skills');
      if (!res.ok) {
        throw new Error(`Failed to fetch skills: ${res.statusText}`);
      }
      return res.json();
    },
  });

  return {
    skills: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useCreateSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: { name: string; description: string; markdownContent: string }) => {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`Failed to create skill: ${res.statusText}`);
      }
      return res.json() as Promise<Skill>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] });
    },
  });
}

export function useImportSkills() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: { repoUrl: string }) => {
      const res = await fetch('/api/skills/ingest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`Failed to import skills: ${res.statusText}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] });
    },
  });
}
