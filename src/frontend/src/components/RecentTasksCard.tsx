import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, Circle, Clock, AlertCircle, Bot } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import {} from '@/lib/utils';

interface Task {
    id: string;
    title: string;
    status: 'backlog' | 'todo' | 'in-progress' | 'done';
    priority: 'low' | 'medium' | 'high' | 'critical';
    assignee: string;
}
interface RecentTasksCardProps {
    owner?: string;
    repo?: string;
}

export function RecentTasksCard({ owner, repo }: RecentTasksCardProps = {}) {
    const { data: tasks = [] } = useQuery({
        queryKey: ['tasks', owner, repo],
        queryFn: async () => {
            const url = (owner && repo) 
                ? `/api/repos/${owner}/${repo}/tasks`
                : `/api/tasks`;
            const res = await axios.get(url, { withCredentials: true });
            return res.data.tasks as Task[];
        },
        initialData: []
    });

    // Sort: Critical/In-Progress first, then by status
    const sortedTasks = [...tasks].sort((a, b) => {
        if (a.priority === 'critical' && b.priority !== 'critical') return -1;
        if (b.priority === 'critical' && a.priority !== 'critical') return 1;
        return 0; // Simple sort for now
    }).slice(0, 5); // Take top 5

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'done': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
            case 'in-progress': return <Clock className="w-4 h-4 text-blue-500" />;
            case 'todo': return <Circle className="w-4 h-4 text-zinc-500" />;
            default: return <Circle className="w-4 h-4 text-zinc-700" />;
        }
    };

    return (
        <Card className="border-zinc-800 bg-zinc-900/50 flex flex-col h-full overflow-hidden">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-purple-400" />
                    Pending Activites
                </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-hidden">
                <ScrollArea className="h-full px-6 pb-4">
                    <div className="space-y-3">
                        {sortedTasks.length === 0 ? (
                            <div className="text-center text-zinc-500 text-sm py-4">No pending tasks</div>
                        ) : (
                            sortedTasks.map((task) => (
                                <div key={task.id} className="flex items-center justify-between border-b border-zinc-800/50 pb-3 last:border-0 last:pb-0">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        {getStatusIcon(task.status)}
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-sm font-medium text-zinc-200 truncate">{task.title}</span>
                                            <div className="flex items-center gap-2">
                                                {task.priority === 'critical' && <Badge variant="destructive" className="h-4 text-[9px] px-1">Critical</Badge>}
                                                <span className="text-xs text-zinc-500 capitalize">{task.status.replace('-', ' ')}</span>
                                            </div>
                                        </div>
                                    </div>
                                    {task.assignee === 'colby-bot' && (
                                        <Bot className="w-4 h-4 text-purple-400 flex-shrink-0" />
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
