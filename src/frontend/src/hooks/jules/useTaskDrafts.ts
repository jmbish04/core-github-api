import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface TaskDraft {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

interface TaskDraftsState {
  drafts: TaskDraft[];
  saveDraft: (draft: Omit<TaskDraft, 'id' | 'createdAt'>) => void;
  removeDraft: (id: string) => void;
  getDraft: (id: string) => TaskDraft | undefined;
}

export const useTaskDrafts = create<TaskDraftsState>()(
  persist(
    (set, get) => ({
      drafts: [
        {
          id: 'draft-1',
          title: 'Refactor auth middleware',
          content: 'Refactor the authentication middleware to support JWT refresh tokens and session-based auth fallback. Update all protected routes to use the new middleware pattern.',
          createdAt: '2026-04-01T09:30:00Z',
        },
        {
          id: 'draft-2',
          title: 'Add E2E tests for onboarding',
          content: 'Write Playwright end-to-end tests covering the full onboarding flow including sign-up, email verification, workspace creation, and first project setup.',
          createdAt: '2026-04-02T14:15:00Z',
        },
        {
          id: 'draft-3',
          title: 'Migrate DB schema to Drizzle',
          content: 'Migrate existing Prisma schema definitions to Drizzle ORM. Create migration scripts and verify data integrity after switchover. Update all repository layer queries.',
          createdAt: '2026-04-03T08:00:00Z',
        },
      ],

      saveDraft: (draft) =>
        set((state) => ({
          drafts: [
            {
              ...draft,
              id: `draft-${Date.now()}`,
              createdAt: new Date().toISOString(),
            },
            ...state.drafts,
          ],
        })),

      removeDraft: (id) =>
        set((state) => ({
          drafts: state.drafts.filter((d) => d.id !== id),
        })),

      getDraft: (id) => get().drafts.find((d) => d.id === id),
    }),
    { name: 'jules-task-drafts' }
  )
);
