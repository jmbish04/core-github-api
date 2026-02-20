import { useEffect, useState } from 'react';
import { KanbanBoard } from '@/components/ui/diceui/kanban';
import type { KanbanItem } from '@/components/ui/diceui/kanban';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Bot, User } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

// --- Types ---
interface Task extends KanbanItem {
    id: string;
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    assignee: string; // 'colby-bot' or user
}

const COLUMNS = [
    { id: 'backlog', title: 'Backlog' },
    { id: 'todo', title: 'To Do' },
    { id: 'in-progress', title: 'In Progress' },
    { id: 'done', title: 'Done' }
];

// --- Component ---

export function ProjectBoard() {
    const queryClient = useQueryClient();
    const repoParams = { owner: 'colby-dev', repo: 'core-api' }; // Mock context

    // 1. Fetch Tasks
    const { data: tasks = [] } = useQuery({
        queryKey: ['tasks', repoParams],
        queryFn: async () => {
            const res = await axios.get(`/api/repos/${repoParams.owner}/${repoParams.repo}/tasks`);
            return res.data.tasks as Task[];
        },
        initialData: []
    });

    // 2. Mutation
    const updateTaskMutation = useMutation({
        mutationFn: async ({ id, status }: { id: string, status: string }) => {
            await axios.patch(`/api/tasks/${id}`, { status });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
        }
    });

    const handleDragEnd = (id: string, newStatus: string) => {
        // Optimistic update could go here
        updateTaskMutation.mutate({ id, status: newStatus });
    };

    const renderCard = (task: Task) => (
        <Card className="bg-zinc-800 cursor-grab active:cursor-grabbing border-zinc-700 hover:border-zinc-600 transition-colors">
            <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-zinc-200 line-clamp-2 leading-tight">
                        {task.title}
                    </span>
                    {task.assignee === 'colby-bot' && (
                        <Badge variant="secondary" className="bg-purple-900/50 text-purple-300 hover:bg-purple-900/50 text-[10px] px-1 py-0 h-5 border-purple-800">
                            <Bot className="w-3 h-3 mr-1" /> Bot
                        </Badge>
                    )}
                </div>

                <div className="flex items-center justify-between pt-2">
                    <div className="flex gap-2">
                        {task.priority === 'critical' && <Badge variant="destructive" className="text-[10px] h-5">Critical</Badge>}
                        {task.priority === 'high' && <Badge variant="outline" className="text-orange-400 border-orange-900 text-[10px] h-5">High</Badge>}
                    </div>

                    {task.assignee !== 'colby-bot' ? (
                        <Avatar className="w-5 h-5">
                            <AvatarFallback className="text-[10px] bg-zinc-700">U</AvatarFallback>
                        </Avatar>
                    ) : null}
                </div>
            </CardContent>
        </Card>
    );

    return (
        <div className="h-[500px] flex flex-col">
            <h3 className="text-lg font-semibold mb-4 px-1">Project Tasks</h3>
            <div className="flex-1 overflow-hidden">
                <KanbanBoard
                    columns={COLUMNS}
                    data={tasks}
                    renderCard={renderCard}
                    onDragEnd={handleDragEnd}
                />
            </div>
        </div>
    );
}
