/**
 * @file TrackerBoardView.tsx
 * @description Kanban board with drag-and-drop columns using @dnd-kit.
 * Columns: Backlog, Todo, In Progress, Review, Done.
 */

import React, { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Circle,
  Clock,
  Loader2,
  CheckCircle2,
  GripVertical,
  ExternalLink,
  AlertTriangle,
  User,
} from 'lucide-react';
import type { TrackerTask } from './TrackerLayout';

interface TrackerBoardViewProps {
  tasks: TrackerTask[];
  isLoading: boolean;
  onTaskUpdate: (id: string, updates: Partial<TrackerTask>) => void;
  onTaskDelete: (id: string) => void;
}

const COLUMNS = [
  { id: 'backlog', label: 'Backlog', icon: Circle, color: 'text-zinc-500', accent: 'border-zinc-700' },
  { id: 'todo', label: 'Todo', icon: Circle, color: 'text-blue-400', accent: 'border-blue-800' },
  { id: 'in_progress', label: 'In Progress', icon: Clock, color: 'text-amber-400', accent: 'border-amber-800' },
  { id: 'review', label: 'Review', icon: Loader2, color: 'text-purple-400', accent: 'border-purple-800' },
  { id: 'done', label: 'Done', icon: CheckCircle2, color: 'text-emerald-400', accent: 'border-emerald-800' },
] as const;

const PRIORITY_DOT: Record<string, string> = {
  low: 'bg-zinc-500',
  medium: 'bg-blue-500',
  high: 'bg-amber-500',
  critical: 'bg-red-500',
};

export function TrackerBoardView({ tasks, isLoading, onTaskUpdate, onTaskDelete }: TrackerBoardViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const columnTasks = useMemo(() => {
    const map: Record<string, TrackerTask[]> = {};
    for (const col of COLUMNS) {
      map[col.id] = tasks.filter((t) => t.status === col.id);
    }
    return map;
  }, [tasks]);

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;

    // Determine target column — "over" could be a column ID or another task ID
    let targetStatus: string | null = null;

    // Check if dropped over a column container
    if (COLUMNS.some((c) => c.id === over.id)) {
      targetStatus = over.id as string;
    } else {
      // Dropped over another task — find that task's column
      const overTask = tasks.find((t) => t.id === over.id);
      if (overTask) targetStatus = overTask.status;
    }

    if (targetStatus) {
      const task = tasks.find((t) => t.id === taskId);
      if (task && task.status !== targetStatus) {
        onTaskUpdate(taskId, { status: targetStatus as TrackerTask['status'] });
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 p-4 h-full overflow-x-auto">
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.id}
            column={col}
            tasks={columnTasks[col.id] || []}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask && <TaskCard task={activeTask} isDragging />}
      </DragOverlay>
    </DndContext>
  );
}

// ── Column ──────────────────────────────────────────────────────────────────

function KanbanColumn({
  column,
  tasks,
}: {
  column: (typeof COLUMNS)[number];
  tasks: TrackerTask[];
}) {
  const Icon = column.icon;

  return (
    <div
      className={cn(
        'flex flex-col w-72 shrink-0 rounded-lg bg-zinc-950/30 border-t-2',
        column.accent
      )}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className={cn('w-4 h-4', column.color)} />
          {column.label}
        </div>
        <Badge variant="secondary" className="text-[10px] h-5">
          {tasks.length}
        </Badge>
      </div>

      {/* Cards */}
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy} id={column.id}>
        <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[100px]">
          {tasks.map((task) => (
            <SortableTaskCard key={task.id} task={task} />
          ))}
          {tasks.length === 0 && (
            <div className="flex items-center justify-center h-20 text-xs text-muted-foreground italic rounded-md border border-dashed border-border/30">
              Drop tasks here
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

// ── Sortable Task Card ──────────────────────────────────────────────────────

function SortableTaskCard({ task }: { task: TrackerTask }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <TaskCard task={task} dragListeners={listeners} />
    </div>
  );
}

// ── Task Card ───────────────────────────────────────────────────────────────

function TaskCard({
  task,
  isDragging,
  dragListeners,
}: {
  task: TrackerTask;
  isDragging?: boolean;
  dragListeners?: Record<string, any>;
}) {
  return (
    <Card
      className={cn(
        'p-3 bg-zinc-900/60 hover:bg-zinc-900/80 transition-colors cursor-default group',
        isDragging && 'shadow-xl ring-2 ring-primary/50 rotate-2'
      )}
    >
      <div className="flex items-start gap-2">
        <button
          {...dragListeners}
          className="mt-0.5 cursor-grab active:cursor-grabbing shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label={`Drag task: ${task.title}`}
          title={`Drag task: ${task.title}`}
        >
          <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <span className="text-sm font-medium leading-tight truncate">{task.title}</span>
            {task.priority && (
              <span
                className={cn('w-2 h-2 rounded-full shrink-0 mt-1.5', PRIORITY_DOT[task.priority])}
                title={task.priority}
              />
            )}
          </div>

          {task.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
          )}

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {task.epicTitle && (
              <Badge variant="outline" className="text-[9px] h-4 px-1 font-normal">
                {task.epicTitle}
              </Badge>
            )}
            {task.tags?.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[9px] h-4 px-1 font-normal">
                {tag}
              </Badge>
            ))}
          </div>

          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-1">
              {task.assignee && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <User className="w-3 h-3" />
                  {task.assignee}
                </span>
              )}
            </div>
            {task.githubHtmlUrl && (
              <a
                href={task.githubHtmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <ExternalLink className="w-3 h-3 text-muted-foreground hover:text-foreground" />
              </a>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
