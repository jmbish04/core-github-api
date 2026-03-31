/**
 * @file TaskKanbanBoard.tsx
 * Shared Kanban board rendering component used by both Global and Repo-scoped views.
 * Presentational only — data fetching and mutation are handled by the parent.
 */

import { useMemo } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  KanbanBoard,
  KanbanCard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
} from "@/components/kibo-ui/kanban";
import type { KanbanColumn, KanbanItem } from "./kanban-utils";

export interface TaskKanbanBoardProps {
  /** Kanban column definitions (id, name, color). */
  columns: KanbanColumn[];
  /** Mapped task items positioned in columns. */
  tasks: KanbanItem[];
  /** Called when a card is dragged to a new column. Receives the full updated data array. */
  onDataChange: (newData: KanbanItem[]) => void;
  /** Optional CSS class for the outer container. */
  className?: string;
}

export function TaskKanbanBoard({
  columns,
  tasks,
  onDataChange,
  className,
}: TaskKanbanBoardProps) {
  const mappedTasks = useMemo(
    () =>
      tasks.map((t) => ({
        ...t,
        column: t.columnId,
      })),
    [tasks]
  );

  return (
    <div
      className={
        className ??
        "flex-1 overflow-hidden rounded-lg bg-zinc-900/50 p-4"
      }
    >
      <KanbanProvider
        columns={columns}
        data={mappedTasks}
        onDataChange={onDataChange}
        className="h-full"
      >
        {(column) => (
          <KanbanBoard id={column.id} key={column.id}>
            <KanbanHeader>
              <div className="flex items-center gap-2">
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: column.color as string }}
                />
                <span>{column.name}</span>
              </div>
            </KanbanHeader>
            <KanbanCards id={column.id}>
              {(feature: any) => (
                <KanbanCard
                  column={column.id}
                  id={feature.id}
                  key={feature.id}
                  name={feature.name}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-1">
                      <p className="m-0 flex-1 font-medium text-sm">
                        {feature.name}
                      </p>
                    </div>
                    {feature.owner && (
                      <Avatar className="h-4 w-4 shrink-0">
                        <AvatarFallback>
                          {feature.owner.name?.slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                  <p className="m-0 text-muted-foreground text-xs">
                    {feature.startAt
                      ? new Date(feature.startAt).toISOString().slice(0, 10)
                      : ""}
                  </p>
                </KanbanCard>
              )}
            </KanbanCards>
          </KanbanBoard>
        )}
      </KanbanProvider>
    </div>
  );
}
