/**
 * @file views/control/global/Kanban.tsx
 * Global Kanban page — cross-repo task board.
 *
 * Refactored to use shared TaskKanbanBoard + kanban-utils.
 * Data fetching and mutations remain here (global scope fetches all tasks
 * or filters by URL params if present).
 */

import { useParams } from "react-router-dom";
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { TaskKanbanBoard } from "@/components/shared/TaskKanbanBoard";
import {
  mapTasksToKanbanItems,
  resolveColumns,
  type KanbanItem,
} from "@/components/shared/kanban-utils";

export default function KanbanPage() {
  const queryClient = useQueryClient();

  const params = useParams();
  const owner = params.owner || params.username;
  const repo = params.repo || params.repo_name;

  // Fetch Tasks & Metadata
  const { data, isLoading } = useQuery({
    queryKey: ["tasks", owner, repo],
    queryFn: async () => {
      const url =
        owner && repo
          ? `/api/tasks/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tasks`
          : "/api/tasks";

      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch tasks");
      const json = (await res.json()) as any;

      return {
        tasks: mapTasksToKanbanItems(json.tasks ?? []),
        columns: resolveColumns(json.meta?.columns),
      };
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const tasks = useMemo(() => data?.tasks || [], [data?.tasks]);
  const columns = useMemo(() => data?.columns || [], [data?.columns]);

  const updateStatusMutation = useMutation({
    mutationFn: async ({
      id,
      kanbanColumn,
    }: {
      id: string;
      kanbanColumn: string;
    }) => {
      await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kanbanColumn }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const handleDataChange = (newData: KanbanItem[]) => {
    for (const newItem of newData) {
      const oldItem = tasks.find((t) => t.id === newItem.id);
      if (oldItem && newItem.columnId !== oldItem.columnId) {
        updateStatusMutation.mutate({
          id: newItem.id,
          kanbanColumn: newItem.columnId,
        });
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-4 md:p-6">
      <h1 className="text-2xl font-bold mb-6">Task Board</h1>
      <TaskKanbanBoard
        columns={columns}
        tasks={tasks}
        onDataChange={handleDataChange}
      />
    </div>
  );
}
