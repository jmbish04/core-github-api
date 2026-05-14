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

export function useUpdateSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; name: string; description: string; markdownContent: string }) => {
      const res = await fetch(`/api/skills/${id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`Failed to update skill: ${res.statusText}`);
      }
      return res.json() as Promise<Skill>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] });
    },
  });
}

export function useDeleteSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/skills/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error(`Failed to delete skill: ${res.statusText}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] });
    },
  });
}

export function useSeedSkills() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/skills/seed', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        throw new Error(`Failed to seed skills: ${res.statusText}`);
      }
      return res.json();
    },
    onSuccess: () => {
      // Delay refetch slightly since seeding is async
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['skills'] });
      }, 3000);
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
        body: JSON.stringify({ githubUrl: body.repoUrl }),
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
