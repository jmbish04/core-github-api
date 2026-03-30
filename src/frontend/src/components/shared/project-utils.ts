/**
 * @file project-utils.ts
 * Shared project types and utility functions used by both Global and Repo-scoped views.
 */

export interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
  repoId: string;
  createdAt: string;
  updatedAt?: string;
  lastDeployedAt?: string | null;
  repoOwner?: string;
  repoName?: string;
}

/**
 * Derives a health label and color dot class from project metadata.
 * Used by ProjectCardGrid to render health indicators on each card.
 */
export function getProjectHealth(project: Project): {
  label: string;
  dotClassName: string;
} {
  const status = (project.status || "").toLowerCase();
  const lastActivity = new Date(
    project.lastDeployedAt || project.updatedAt || project.createdAt || 0
  ).getTime();
  const daysSinceActivity = Number.isFinite(lastActivity)
    ? (Date.now() - lastActivity) / (1000 * 60 * 60 * 24)
    : Infinity;

  if (status === "active" && daysSinceActivity <= 7) {
    return { label: "healthy", dotClassName: "bg-emerald-400" };
  }
  if (status === "active") {
    return { label: "stale", dotClassName: "bg-amber-400" };
  }
  if (status === "failed" || status === "error") {
    return { label: "degraded", dotClassName: "bg-rose-400" };
  }
  return { label: status || "unknown", dotClassName: "bg-zinc-400" };
}
