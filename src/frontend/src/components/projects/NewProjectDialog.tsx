import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, User, Wand2, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Schema matches schema-drafts roughly
const formSchema = z.object({
    name: z.string().min(2, { message: "Project name must be at least 2 characters." }),
    description: z.string().optional(),
    visibility: z.enum(["public", "private", "internal"]),
    infraType: z.enum(["worker", "pages", "python", "vercel", "other"]).optional(),
    frontendConfig: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

interface NewProjectDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function NewProjectDialog({ open, onOpenChange }: NewProjectDialogProps) {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [messages, setMessages] = useState<{ role: 'ai' | 'user', content: string }[]>([
        { role: 'ai', content: "Hello! I'm your Expedition Copilot. What kind of project are we building today? I can help suggest infrastructure choices." }
    ]);
    const [chatInput, setChatInput] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            description: "",
            visibility: "private",
            infraType: "worker",
            frontendConfig: false,
        },
    });

    // Chat Logic
    const handleChatSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatInput.trim()) return;

        setMessages(prev => [...prev, { role: 'user', content: chatInput }]);
        // Mock AI response
        setTimeout(() => {
            setMessages(prev => [...prev, { role: 'ai', content: "I've noted that. Just fill out the form when you're ready." }]);
        }, 1000);
        setChatInput('');
    };

    const onSubmit = async (data: FormValues) => {
        setIsSubmitting(true);
        setSubmitError(null);

        try {
            const res = await fetch('/api/projects', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    name: data.name,
                    description: data.description,
                    visibility: data.visibility,
                    infraType: data.infraType,
                    owner: import.meta.env.VITE_GITHUB_OWNER || '',
                }),
            });

            const json = (await res.json().catch(() => ({} as any))) as any;
            if (!res.ok) {
                throw new Error(json?.error || `Failed to create project (${res.status})`);
            }

            await queryClient.invalidateQueries({ queryKey: ['projects'] });
            setIsSubmitting(false);
            onOpenChange(false);
            navigate('/projects');
        } catch (error: any) {
            setIsSubmitting(false);
            setSubmitError(error?.message || 'Failed to create project');
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
                <div className="flex h-full">
                    {/* Left: Form */}
                    <div className="w-1/2 p-6 overflow-y-auto border-r bg-card">
                        <DialogHeader className="mb-6">
                            <DialogTitle className="flex items-center gap-2">
                                <Wand2 className="w-5 h-5 text-purple-500" />
                                New Project Expedition
                            </DialogTitle>
                            <DialogDescription>
                                Configure your project. The AI will assist with details.
                            </DialogDescription>
                        </DialogHeader>

                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Project Name</FormLabel>
                                            <FormControl>
                                                <Input placeholder="my-awesome-worker-api" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="description"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Description</FormLabel>
                                            <FormControl>
                                                <Input placeholder="A brief summary..." {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <div className="grid grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="visibility"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Visibility</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="public">Public</SelectItem>
                                                        <SelectItem value="private">Private</SelectItem>
                                                        <SelectItem value="internal">Internal</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="infraType"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Infrastructure</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="worker">Cloudflare Worker</SelectItem>
                                                        <SelectItem value="pages">Cloudflare Pages</SelectItem>
                                                        <SelectItem value="python">Python Script</SelectItem>
                                                        <SelectItem value="vercel">Vercel</SelectItem>
                                                        <SelectItem value="other">Other</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                {submitError && (
                                    <p className="text-sm text-destructive">{submitError}</p>
                                )}

                                <Button type="submit" className="w-full mt-6" disabled={isSubmitting}>
                                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Launch Expedition"}
                                </Button>
                            </form>
                        </Form>
                    </div>

                    {/* Right: AI Chat */}
                    <div className="w-1/2 flex flex-col bg-muted/10">
                        <div className="p-4 border-b">
                            <h3 className="text-sm font-medium flex items-center gap-2">
                                <Bot className="w-4 h-4 text-emerald-500" /> Expedition Copilot
                            </h3>
                        </div>
                        <ScrollArea className="flex-1 p-4">
                            <div className="space-y-4">
                                {messages.map((m, i) => (
                                    <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${m.role === 'user' ? 'bg-primary' : 'bg-emerald-600'
                                            }`}>
                                            {m.role === 'user' ? <User className="w-4 h-4 text-primary-foreground" /> : <Bot className="w-4 h-4 text-white" />}
                                        </div>
                                        <div className={`rounded-lg p-3 text-sm max-w-[85%] ${m.role === 'user' ? 'bg-primary/10 text-primary-foreground' : 'bg-card border shadow-sm'
                                            }`}>
                                            {m.content}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                        <div className="p-4 border-t bg-background">
                            <form onSubmit={handleChatSubmit} className="flex gap-2">
                                <Input
                                    value={chatInput}
                                    onChange={e => setChatInput(e.target.value)}
                                    placeholder="Ask for suggestions..."
                                    className="flex-1"
                                />
                                <Button type="submit" size="sm" variant="secondary">Send</Button>
                            </form>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
