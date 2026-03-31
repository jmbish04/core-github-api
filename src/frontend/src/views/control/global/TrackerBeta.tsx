/**
 * @file TrackerBeta.tsx
 * @description Beta Project Tracker page — wraps TrackerLayout with data fetching
 * from existing backend APIs. Supports both global (/beta/tracker) and
 * repo-scoped (/project/:owner/:repo/beta-tracker) modes.
 */

import React, { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TrackerLayout, type TrackerTask } from '@/components/project-dashboard/beta/TrackerLayout';

export function TrackerBeta() {
  const { owner, repo } = useParams<{ owner?: string; repo?: string }>();
  const queryClient = useQueryClient();
  const isRepoScoped = Boolean(owner && repo);

  // ── Resolve project ID for repo-scoped mode ──
  const projectLookup = useQuery({
    queryKey: ['tracker-project-lookup', owner, repo],
    queryFn: async () => {
      const res = await fetch(
        `/api/projects/by-repo/${encodeURIComponent(owner!)}/${encodeURIComponent(repo!)}`,
        { credentials: 'include' }
      );
      if (!res.ok) return null;
      return (await res.json()) as { projectId: string };
    },
    enabled: isRepoScoped,
    staleTime: 60_000,
  });

  // ── Fetch tasks ──
  const tasksQuery = useQuery({
    queryKey: ['tracker-tasks', owner, repo],
    queryFn: async () => {
      const url = isRepoScoped
        ? `/api/projects/repos/${encodeURIComponent(owner!)}/${encodeURIComponent(repo!)}/tasks`
        : '/api/projects/tasks';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to fetch tasks: ${res.status}`);
      const data = (await res.json()) as { success: boolean; tasks: any[] };
      return (data.tasks || []).map(mapApiTask);
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  // ── Mutations ──
  const invalidateTasks = () =>
    queryClient.invalidateQueries({ queryKey: ['tracker-tasks', owner, repo] });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<TrackerTask> }) => {
      const res = await fetch(`/api/projects/tasks/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error(`Failed to update task: ${res.status}`);
      return res.json();
    },
    onSuccess: invalidateTasks,
  });

  const createMutation = useMutation({
    mutationFn: async (task: { title: string; description?: string; status?: string }) => {
      // For repo-scoped, use the repo-specific endpoint
      const url = isRepoScoped
        ? `/api/projects/repos/${encodeURIComponent(owner!)}/${encodeURIComponent(repo!)}/tasks`
        : '/api/projects/tasks';
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      });
      if (!res.ok) throw new Error(`Failed to create task: ${res.status}`);
      return res.json();
    },
    onSuccess: invalidateTasks,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/projects/tasks/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Failed to delete task: ${res.status}`);
      return res.json();
    },
    onSuccess: invalidateTasks,
  });

  // ── Handlers ──
  const handleTaskUpdate = useCallback(
    (id: string, updates: Partial<TrackerTask>) => {
      updateMutation.mutate({ id, updates });
    },
    [updateMutation]
  );

  const handleTaskCreate = useCallback(
    (task: { title: string; description?: string; status?: string }) => {
      createMutation.mutate(task);
    },
    [createMutation]
  );

  const handleTaskDelete = useCallback(
    (id: string) => {
      deleteMutation.mutate(id);
    },
    [deleteMutation]
  );

  return (
    <TrackerLayout
      tasks={tasksQuery.data || []}
      isLoading={tasksQuery.isLoading}
      onTaskUpdate={handleTaskUpdate}
      onTaskCreate={handleTaskCreate}
      onTaskDelete={handleTaskDelete}
    />
  );
}

// ── API → Component type mapper ──

function mapApiTask(raw: any): TrackerTask {
  return {
    id: raw.id,
    title: raw.title || 'Untitled',
    description: raw.description || undefined,
    status: raw.status || 'todo',
    priority: raw.priority || undefined,
    assignee: raw.assignee || undefined,
    kanbanColumn: raw.kanbanColumn || undefined,
    tags: raw.tags || [],
    createdAt: raw.createdAt || raw.created_at || undefined,
    updatedAt: raw.updatedAt || raw.updated_at || undefined,
    startAt: raw.startAt || raw.start_at || undefined,
    endAt: raw.endAt || raw.end_at || undefined,
    githubHtmlUrl: raw.githubHtmlUrl || raw.github_html_url || undefined,
    repoId: raw.repoId || raw.repo_id || undefined,
    epicTitle: raw.epicTitle || undefined,
    storyTitle: raw.storyTitle || undefined,
  };
}

export default TrackerBeta;
