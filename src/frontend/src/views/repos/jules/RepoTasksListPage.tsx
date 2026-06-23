import React from 'react';
import { useParams } from 'react-router-dom';
import TasksListPage from '@/views/control/global/jules/TasksListPage';

export function RepoTasksListPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  
  // We construct the projectId from owner/repo or use it directly if that's how the backend expects it.
  // Assuming the backend can filter by a project identifier. 
  // We'll pass `${owner}/${repo}` or let the backend handle it.
  const projectId = owner && repo ? `${owner}/${repo}` : undefined;
  
  // Provide the repo-scoped base URL for task links
  const baseUrl = `/repos/${owner}/${repo}/jules/tasks`;

  return <TasksListPage projectId={projectId} baseUrl={baseUrl} />;
}

export default RepoTasksListPage;
