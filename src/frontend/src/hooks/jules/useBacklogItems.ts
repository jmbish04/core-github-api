import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface BacklogTask {
  id: string;
  repoId: string;
  title: string;
  description: string;
  status: string;
  kanbanColumn: string;
  assignee: string | null;
  githubIssueId: number | null;
  githubHtmlUrl: string | null;
  priority?: string;
  parentId?: string | null;
  createdAt: string;
  updatedAt: string;
  isDeleted: number;
  children?: BacklogTask[];
}

interface TasksResponse {
  success: boolean;
  tasks: BacklogTask[];
  meta: {
    columns: { id: string; name: string; color: string }[];
  };
}

function buildTree(tasks: BacklogTask[]): BacklogTask[] {
  const taskMap = new Map<string, BacklogTask>();
  const roots: BacklogTask[] = [];

  for (const task of tasks) {
    taskMap.set(task.id, { ...task, children: [] });
  }

  for (const task of taskMap.values()) {
    if (task.parentId && taskMap.has(task.parentId)) {
      taskMap.get(task.parentId)!.children!.push(task);
    } else {
      roots.push(task);
    }
  }

  return roots;
}

export function useBacklogItems(projectId?: string) {
  const query = useQuery<TasksResponse>({
    queryKey: ['backlogItems', projectId],
    queryFn: async () => {
      const url = new URL('/api/tasks', window.location.origin);
      if (projectId) {
        url.searchParams.set('projectId', projectId);
      }
      const res = await fetch(url.toString());
      if (!res.ok) {
        throw new Error(`Failed to fetch tasks: ${res.statusText}`);
      }
      return res.json();
    },
  });

  const flatTasks = query.data?.tasks || [];
  const items = buildTree(flatTasks);
  const columns = query.data?.meta?.columns || [];

  return {
    items,
    columns,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: {
      id: string;
      status?: string;
      kanbanColumn?: string;
      title?: string;
      description?: string;
      assignee?: string;
      priority?: string;
    }) => {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`Failed to update task: ${res.statusText}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backlogItems'] });
    },
  });
}
