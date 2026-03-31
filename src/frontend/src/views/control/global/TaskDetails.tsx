import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea'; // Assuming simple textarea for now as Editor had issues
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, Send } from 'lucide-react';
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function TaskDetails() {
    const { taskId } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [commentInput, setCommentInput] = useState("");

    const { data, isLoading, error } = useQuery({
        queryKey: ['task', taskId],
        queryFn: async () => {
            const res = await fetch(`/api/tasks/${taskId}`);
            return (await res.json()) as any;
        }
    });

    const updateTaskMutation = useMutation({
        mutationFn: async (updates: any) => {
            const res = await fetch(`/api/tasks/${taskId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });
            if (!res.ok) throw new Error('Failed to update task');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['task', taskId] });
        }
    });

    const addCommentMutation = useMutation({
        mutationFn: async (content: string) => {
            const res = await fetch(`/api/tasks/${taskId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, author: 'User' }) // TODO: Get actual user
            });
            if (!res.ok) throw new Error('Failed to add comment');
            return res.json();
        },
        onSuccess: () => {
            setCommentInput("");
            queryClient.invalidateQueries({ queryKey: ['task', taskId] });
        }
    });

    if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;
    if (error || !data?.task) return <div className="p-8">Task not found</div>;

    const task = data.task;
    const comments = data.comments || [];

    const handleSubmiComment = (e: React.FormEvent) => {
        e.preventDefault();
        if (!commentInput.trim()) return;
        addCommentMutation.mutate(commentInput);
    };

    return (
        <div className="container mx-auto py-6 max-w-4xl space-y-6">
            <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2">
                <ArrowLeft className="w-4 h-4" /> Back
            </Button>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Main Content */}
                <div className="md:col-span-2 space-y-6">
                    <Card>
                        <CardHeader className="space-y-4">
                            <div className="flex items-start justify-between gap-4">
                                <CardTitle className="text-2xl font-bold">
                                    <Input
                                        defaultValue={task.title}
                                        className="text-xl font-bold border-transparent hover:border-input px-0 h-auto"
                                        onBlur={(e) => {
                                            if (e.target.value !== task.title) {
                                                updateTaskMutation.mutate({ title: e.target.value });
                                            }
                                        }}
                                    />
                                </CardTitle>
                                <Badge variant={task.status === 'done' ? 'success' : 'secondary'} className="uppercase">
                                    {task.status}
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <label className="text-sm font-medium text-muted-foreground mb-2 block">Description</label>
                            <Textarea
                                defaultValue={task.description}
                                className="min-h-[200px]"
                                onBlur={(e) => {
                                    if (e.target.value !== task.description) {
                                        updateTaskMutation.mutate({ description: e.target.value });
                                    }
                                }}
                            />
                        </CardContent>
                    </Card>

                    {/* Comments */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Activity</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {comments.map((c: any) => (
                                <div key={c.id} className="flex gap-3 text-sm">
                                    <Avatar className="w-8 h-8">
                                        <AvatarFallback>{c.author?.[0] || 'U'}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 space-y-1">
                                        <div className="flex items-center justify-between">
                                            <span className="font-medium">{c.author}</span>
                                            <span className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</span>
                                        </div>
                                        <p className="text-muted-foreground whitespace-pre-wrap">{c.content}</p>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                        <CardFooter>
                            <form onSubmit={handleSubmiComment} className="w-full flex gap-2">
                                <Input
                                    placeholder="Leave a comment..."
                                    value={commentInput}
                                    onChange={e => setCommentInput(e.target.value)}
                                />
                                <Button type="submit" disabled={addCommentMutation.isPending}>
                                    <Send className="w-4 h-4" />
                                </Button>
                            </form>
                        </CardFooter>
                    </Card>
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium">Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-muted-foreground">Status</label>
                                <Select
                                    defaultValue={task.status}
                                    onValueChange={(val) => updateTaskMutation.mutate({ status: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="todo">To Do</SelectItem>
                                        <SelectItem value="in_progress">In Progress</SelectItem>
                                        <SelectItem value="done">Done</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-medium text-muted-foreground">Assignee</label>
                                <Input
                                    defaultValue={task.assignee || ""}
                                    placeholder="Unassigned"
                                    onBlur={(e) => {
                                        if (e.target.value !== task.assignee) {
                                            updateTaskMutation.mutate({ assignee: e.target.value });
                                        }
                                    }}
                                />
                            </div>

                            <div className="text-xs text-muted-foreground pt-4 border-t">
                                Created {new Date(task.createdAt).toLocaleDateString()}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
