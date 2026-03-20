export type RecentProject = {
  repoOwner: string;
  repoName: string;
  projectName?: string;
  visitedAt: string;
};

const RECENT_PROJECTS_KEY = "control_center_recent_projects";
const RECENT_PROJECTS_EVENT = "control-center-recent-projects-updated";
const RECENT_LIMIT = 10;

export function getRecentProjects(): RecentProject[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(RECENT_PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentProject[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => entry.repoOwner && entry.repoName);
  } catch {
    return [];
  }
}

export function pushRecentProject(project: {
  repoOwner: string;
  repoName: string;
  projectName?: string;
}): void {
  if (typeof window === "undefined") {
    return;
  }

  const nextEntry: RecentProject = {
    repoOwner: project.repoOwner,
    repoName: project.repoName,
    projectName: project.projectName,
    visitedAt: new Date().toISOString(),
  };

  const existing = getRecentProjects();
  const deduped = existing.filter(
    (entry) =>
      !(
        entry.repoOwner.toLowerCase() === project.repoOwner.toLowerCase() &&
        entry.repoName.toLowerCase() === project.repoName.toLowerCase()
      ),
  );

  const next = [nextEntry, ...deduped].slice(0, RECENT_LIMIT);
  window.localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(RECENT_PROJECTS_EVENT));
}

export function removeRecentProject(project: {
  repoOwner: string;
  repoName: string;
}): void {
  if (typeof window === "undefined") {
    return;
  }

  const next = getRecentProjects().filter(
    (entry) =>
      !(
        entry.repoOwner.toLowerCase() === project.repoOwner.toLowerCase() &&
        entry.repoName.toLowerCase() === project.repoName.toLowerCase()
      ),
  );
  window.localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(RECENT_PROJECTS_EVENT));
}

export function subscribeToRecentProjectUpdates(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handler = () => callback();
  window.addEventListener(RECENT_PROJECTS_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(RECENT_PROJECTS_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
