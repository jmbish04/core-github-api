import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Repository {
  id: number;
  owner: string;
  name: string;
  full_name: string; // "env.GITHUB_OWNER/repo-name"
  description?: string;
}

interface ProjectState {
  activeProjects: Repository[];
  isLoading: boolean;
  
  fetchFavorites: (userId: string) => Promise<void>;
  addFavorite: (userId: string, repo: Repository) => Promise<void>;
  removeFavorite: (userId: string, repo: Repository) => Promise<void>;
  isFavorite: (repoFullName: string) => boolean;
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  activeProjects: [],
  isLoading: false,

  fetchFavorites: async (userId) => {
    set({ isLoading: true });
    try {
      const resp = await fetch(`/api/projects/favorites?userId=${encodeURIComponent(userId)}`, { credentials: "include" });
      if (resp.ok) {
        const data = await resp.json() as any;
        const mapped = (data.favorites || []).map((fav: any) => ({
          id: fav.repoId,
          owner: fav.repoOwner,
          name: fav.repoName,
          full_name: `${fav.repoOwner}/${fav.repoName}`,
          description: fav.projectDescription
        }));
        set({ activeProjects: mapped });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  addFavorite: async (userId, repo) => {
    const { activeProjects } = get();
    if (activeProjects.find(p => p.full_name === repo.full_name)) return;

    try {
      const resp = await fetch("/api/projects/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, repoOwner: repo.owner, repoName: repo.name }),
        credentials: "include"
      });
      if (resp.ok) {
        set({ activeProjects: [...activeProjects, repo] });
      }
    } catch (e) {
      console.error("Failed to add favorite", e);
    }
  },

  removeFavorite: async (userId, repo) => {
    try {
      const resp = await fetch(`/api/projects/favorites/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}?userId=${encodeURIComponent(userId)}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (resp.ok) {
        set((state) => ({
          activeProjects: state.activeProjects.filter((p) => p.full_name !== repo.full_name),
        }));
      }
    } catch (e) {
      console.error("Failed to remove favorite", e);
    }
  },

  isFavorite: (repoFullName) => {
    return get().activeProjects.some((p) => p.full_name === repoFullName);
  },
}));
