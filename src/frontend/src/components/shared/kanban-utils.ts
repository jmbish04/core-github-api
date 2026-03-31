/**
 * @file kanban-utils.ts
 * Shared Kanban data-mapping utilities used by both Global and Repo-scoped Kanban views.
 */

export interface KanbanColumn {
  id: string;
  name: string;
  color: string;
}

export interface KanbanItem {
  id: string;
  columnId: string;
  content: string;
  priority: string;
  assignee?: {
    name: string;
    avatar: string;
  };
  dueDate?: Date;
}

export interface RawTask {
  id: string;
  title: string;
  kanbanColumn?: string;
  status?: string;
  priority?: string;
  assignee?: string;
  dueDate?: string;
}

/** Default columns rendered when the API returns no column metadata. */
export const DEFAULT_COLUMNS: KanbanColumn[] = [
  { id: "backlog", name: "Backlog", color: "#6b7280" },
  { id: "todo", name: "To Do", color: "#3b82f6" },
  { id: "in_progress", name: "In Progress", color: "#f59e0b" },
  { id: "review", name: "In Review", color: "#8b5cf6" },
  { id: "done", name: "Done", color: "#10b981" },
];

/** Maps raw API task objects into the shape expected by KanbanProvider. */
export function mapTasksToKanbanItems(tasks: RawTask[]): KanbanItem[] {
  return tasks.map((t) => ({
    id: t.id,
    columnId: t.kanbanColumn || t.status || "backlog",
    content: t.title,
    priority: t.priority || "medium",
    assignee: t.assignee
      ? {
          name: t.assignee,
          avatar: `https://github.com/${t.assignee}.png`,
        }
      : undefined,
    dueDate: t.dueDate ? new Date(t.dueDate) : undefined,
  }));
}

/** Resolves columns from API metadata, falling back to DEFAULT_COLUMNS. */
export function resolveColumns(
  apiColumns?: KanbanColumn[] | null
): KanbanColumn[] {
  return apiColumns && apiColumns.length > 0 ? apiColumns : DEFAULT_COLUMNS;
}
