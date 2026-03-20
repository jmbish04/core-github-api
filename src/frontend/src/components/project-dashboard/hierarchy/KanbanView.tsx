import React, { useState, useEffect } from 'react';
import { DndContext, closestCorners, DragOverlay, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useHierarchy } from "./HierarchyContext";
import { Bot, User } from 'lucide-react';
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

// 1. Extract tasks from the project tree
const getTasksFromTree = (project: any) => {
  const tasks: any[] = [];
  if (!project) return tasks;

  // Traverse Project -> Epics -> Stories -> Tasks
  // We want to flatten all tasks and attach their story/epic info
  project.epics?.forEach((epic: any) => {
      epic.userStories?.forEach((story: any) => {
          story.tasks?.forEach((task: any) => {
              tasks.push({
                  ...task,
                  storyTitle: story.title,
                  epicTitle: epic.title,
                  projectId: project.id // useful if we need it
              });
          });
      });
  });
  return tasks;
};

// Simple Sortable Item Wrapper (or just use Card directly if we don't need sorting *within* column yet)
// For now, let's just make Draggable Cards.
import { useDraggable, useDroppable } from '@dnd-kit/core';

const KanbanCard = ({ task }: { task: any }) => {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id: task.id,
        data: { task }
    });
    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    } : undefined;

    return (
        <Card ref={setNodeRef} style={style} {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing hover:border-zinc-500 transition-colors bg-zinc-800 border-zinc-700/50">
            <CardHeader className="p-3">
                <div className="flex justify-between items-start gap-2">
                    <span className="text-sm font-medium leading-tight text-zinc-100">{task.title}</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-zinc-600 text-zinc-400 max-w-[100px] truncate">
                        {task.storyTitle}
                    </Badge>
                     <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-blue-900/50 text-blue-300">
                        {task.priority}
                    </Badge>
                </div>
            </CardHeader>
        </Card>
    );
}

const KanbanColumn = ({ id, title, tasks }: { id: string, title: string, tasks: any[] }) => {
    const { setNodeRef } = useDroppable({ id });

    return (
        <div ref={setNodeRef} className="bg-muted/30 p-3 rounded-lg flex flex-col gap-3 h-full min-h-[200px] border border-transparent hover:border-muted/50 transition-colors">
            <div className="flex items-center justify-between">
                <h3 className="font-semibold uppercase text-xs text-muted-foreground tracking-wider">{title}</h3>
                <Badge variant="secondary" className="bg-zinc-800 text-zinc-400 hover:bg-zinc-800 text-[10px] h-5">{tasks.length}</Badge>
            </div>
            
            <div className="flex-1 flex flex-col gap-2 overflow-y-auto pr-1">
                {tasks.map(task => (
                    <KanbanCard key={task.id} task={task} />
                ))}
            </div>
        </div>
    )
}

export function KanbanView() {
  const { data, updateItem } = useHierarchy();
  const tasks = getTasksFromTree(data);
  const columns = [
      { id: 'todo', title: 'To Do' },
      { id: 'in_progress', title: 'In Progress' },
      { id: 'done', title: 'Done' },
      // { id: 'backlog', title: 'Backlog' }
  ];

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id;
    const newStatus = over.id; // column id
    const currentTask = active.data.current?.task || tasks.find((t: any) => t.id === taskId);

    if (currentTask && currentTask.status !== newStatus) {
        // Optimistic UI Update via Context
        // We know it's a task because we extracted it from tasks list
        await updateItem({ type: 'task', id: taskId, data: { status: newStatus } });
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-3 gap-4 h-[600px] p-1">
        {columns.map(col => (
            <KanbanColumn 
                key={col.id} 
                id={col.id} 
                title={col.title} 
                tasks={tasks.filter((t: any) => t.status === col.id)} 
            />
        ))}
      </div>
      {/* Add DragOverlay if we want smoother visuals, but basic works for now */}
    </DndContext>
  );
}
