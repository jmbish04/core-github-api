import {
    KanbanBoard,
    KanbanCard,
    KanbanCards,
    KanbanHeader,
    KanbanProvider,
} from "@/components/kibo-ui/kanban";
import { useNavigate, useParams } from 'react-router-dom';
import { useState, useMemo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

// Default columns as fallback


const dateFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
});

export default function KanbanPage() {
    const queryClient = useQueryClient();

    const params = useParams();
    const owner = params.owner || params.username;
    const repo = params.repo || params.repo_name;

    // Fetch Tasks & Metadata
    const { data, isLoading } = useQuery({
        queryKey: ['tasks', owner, repo],
        queryFn: async () => {
            const url = (owner && repo) 
                ? `/api/tasks/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tasks`
                : '/api/tasks';
            
            const res = await fetch(url);
            if (!res.ok) throw new Error('Failed to fetch tasks');
            const json = await res.json();

            // Map API tasks to Kanban items
            const mappedTasks = json.tasks.map((t: any) => ({
                id: t.id,
                columnId: t.kanbanColumn || t.status || 'backlog',
                content: t.title,
                priority: t.priority || 'medium',
                assignee: t.assignee ? {
                    name: t.assignee,
                    avatar: `https://github.com/${t.assignee}.png`
                } : undefined,
                dueDate: t.dueDate ? new Date(t.dueDate) : undefined
            }));

            // If we are in project view but API doesn't return columns meta for it, use defaults
            // or existing global logic. Current API might not return meta for project specific?
            // Assuming API structure is similar for both.
            return {
                tasks: mappedTasks,
                columns: json.meta?.columns || []
            };
        },
        refetchInterval: 5000
    });

    const tasks = data?.tasks || [];
    const columns = data?.columns || [];

    const updateStatusMutation = useMutation({
        mutationFn: async ({ id, kanbanColumn }: { id: string, kanbanColumn: string }) => {
            await fetch(`/api/tasks/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kanbanColumn })
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
        }
    });

    // Transform tasks for Kanban
    // Kibo Kanban expects data to handle its own state, but we sync with server
    // For drag and drop, we need to handle the update

    const handleDataChange = (newData: any[]) => {
        newData.forEach(newItem => {
            const oldItem = tasks?.find((t: any) => t.id === newItem.id);
            // Check if columnId changed (mapped to kanbanColumn)
            // Note: mappedTasks uses 'columnId', ensure consistency
            // The library likely returns objects with the same keys as passed in 'data'
            const newColumn = newItem.columnId;
            const oldColumn = oldItem?.kanbanColumn || oldItem?.status || 'backlog';

            if (newColumn && newColumn !== oldColumn) {
                updateStatusMutation.mutate({ id: newItem.id, kanbanColumn: newColumn });
            }
        });
    };

    // Map status 'in_progress' -> 'in_progress' etc.
    // Ensure tasks match column IDs.
    const mappedTasks = useMemo(() => {
        if (!tasks) return [];
        return tasks.map((t: any) => ({
            ...t,
            column: t.status // Ensure 'status' matches column IDs
        }));
    }, [tasks]);

    if (isLoading) {
        return <div className="flex h-screen items-center justify-center bg-zinc-950 text-white"><Loader2 className="animate-spin" /></div>;
    }

    return (
        <div className="flex flex-col h-screen bg-zinc-950 text-zinc-50 font-sans p-6">
            <h1 className="text-2xl font-bold mb-6">Task Board</h1>
            <div className="flex-1 overflow-hidden border rounded-lg bg-zinc-900/50 p-4">
                <KanbanProvider
                    columns={columns}
                    data={mappedTasks}
                    onDataChange={handleDataChange}
                    className="h-full"
                >
                    {(column) => (
                        <KanbanBoard id={column.id} key={column.id}>
                            <KanbanHeader>
                                <div className="flex items-center gap-2">
                                    <div
                                        className="h-2 w-2 rounded-full"
                                        style={{ backgroundColor: column.color as any }}
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
                                                    {/* <AvatarImage src={feature.owner.image} /> */}
                                                    <AvatarFallback>
                                                        {feature.owner.name?.slice(0, 2)}
                                                    </AvatarFallback>
                                                </Avatar>
                                            )}
                                        </div>
                                        <p className="m-0 text-muted-foreground text-xs">
                                            {shortDateFormatter.format(new Date(feature.startAt))}
                                        </p>
                                    </KanbanCard>
                                )}
                            </KanbanCards>
                        </KanbanBoard>
                    )}
                </KanbanProvider>
            </div>
        </div>
    );
};
