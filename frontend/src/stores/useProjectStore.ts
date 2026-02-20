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
  // Projects currently visible in the sidebar
  activeProjects: Repository[];
  // Projects that persist across reloads
  favoriteProjects: Repository[];
  
  // Actions
  openProject: (repo: Repository) => void;
  closeProject: (repoFullName: string) => void;
  toggleFavorite: (repo: Repository) => void;
  isFavorite: (repoFullName: string) => boolean;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      activeProjects: [],
      favoriteProjects: [],

      openProject: (repo) => {
        const { activeProjects } = get();
        // Prevent duplicates
        if (!activeProjects.find((p) => p.full_name === repo.full_name)) {
          set({ activeProjects: [...activeProjects, repo] });
        }
      },

      closeProject: (repoFullName) => {
        set((state) => ({
          activeProjects: state.activeProjects.filter((p) => p.full_name !== repoFullName),
        }));
      },

      toggleFavorite: (repo) => {
        const { favoriteProjects, activeProjects } = get();
        const isFav = favoriteProjects.some((p) => p.full_name === repo.full_name);

        if (isFav) {
          set({
            favoriteProjects: favoriteProjects.filter((p) => p.full_name !== repo.full_name),
          });
        } else {
          set({
            favoriteProjects: [...favoriteProjects, repo],
            // If we favorite it, ensure it's open
            activeProjects: activeProjects.find(p => p.full_name === repo.full_name) 
              ? activeProjects 
              : [...activeProjects, repo]
          });
        }
      },

      isFavorite: (repoFullName) => {
        return get().favoriteProjects.some((p) => p.full_name === repoFullName);
      },
    }),
    {
      name: 'project-storage', // Key for localStorage
      partialize: (state) => ({ favoriteProjects: state.favoriteProjects }), // Only persist favorites
    }
  )
);
