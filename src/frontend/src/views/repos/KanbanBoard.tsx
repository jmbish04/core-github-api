/**
 * @file views/repos/KanbanBoard.tsx
 * Repo-scoped Kanban thin wrapper.
 *
 * Pulls task data from RepoLayout's useOutletContext, maps it via shared
 * kanban-utils, and renders the shared TaskKanbanBoard component.
 * Handles drag-and-drop status mutations scoped to this repository.
 */

import { useOutletContext } from "react-router-dom";
import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { TaskKanbanBoard } from "@/components/shared/TaskKanbanBoard";
import {
  mapTasksToKanbanItems,
  resolveColumns,
  type KanbanItem,
} from "@/components/shared/kanban-utils";

export default function RepoKanbanPage() {
  const queryClient = useQueryClient();
  const { repoOwner, repoName, taskQueryData } = useOutletContext<any>();

  const rawTasks = useMemo(() => taskQueryData?.tasks || [], [taskQueryData?.tasks]);
  const apiColumns = useMemo(() => taskQueryData?.meta?.columns || null, [taskQueryData?.meta?.columns]);

  /** Map raw API tasks to KanbanItem shape. */
  const kanbanItems = useMemo(
    () => mapTasksToKanbanItems(rawTasks),
    [rawTasks]
  );

  /** Resolve column definitions (API metadata or defaults). */
  const columns = useMemo(() => resolveColumns(apiColumns), [apiColumns]);

  /** Mutation: PATCH task status when card is dragged to a new column. */
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
      queryClient.invalidateQueries({
        queryKey: ["tasks", repoOwner, repoName],
      });
    },
  });

  /** Handle drag-and-drop column changes. */
  const handleDataChange = (newData: KanbanItem[]) => {
    for (const newItem of newData) {
      const oldItem = kanbanItems.find((t) => t.id === newItem.id);
      if (oldItem && newItem.columnId !== oldItem.columnId) {
        updateStatusMutation.mutate({
          id: newItem.id,
          kanbanColumn: newItem.columnId,
        });
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-2xl font-bold tracking-tight text-zinc-100 mb-6">
        Task Board —{" "}
        <span className="text-zinc-400 font-normal text-lg">
          {repoOwner}/{repoName}
        </span>
      </h2>
      <TaskKanbanBoard
        columns={columns}
        tasks={kanbanItems}
        onDataChange={handleDataChange}
        className="flex-1 overflow-hidden rounded-lg bg-zinc-900/50 border border-zinc-800/20 p-4"
      />
    </div>
  );
}
