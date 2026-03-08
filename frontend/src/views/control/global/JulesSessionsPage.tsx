import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Play, CheckCircle, XCircle, AlertTriangle, MessageSquare, Plus, Send, GitBranch, Github, Server, Bot, User, LayoutDashboard, BrainCircuit, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useJulesRuntime, JulesThread } from "@/components/jules-chat/useJulesRuntime";
import { JulesBlockContent } from "@/components/jules-chat/JulesGenerativeUI";
import ReactMarkdown from 'react-markdown';
import { CFCommandCenterNav } from '@/components/cloudflare-chat/CFCommandCenterNav';

// --- API Helpers ---

const fetchSessions = async () => {
    const res = await fetch('/api/agents/jules-sessions');
    if (!res.ok) throw new Error("Failed to fetch sessions");
    return res.json();
};

const createDraftSession = async (payload: { repoOwner: string, repoName: string, prompt: string }) => {
    const res = await fetch('/api/agents/jules-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, isDraft: true })
    });
    if (!res.ok) throw new Error("Failed to create draft");
    return res.json();
};

const updateAutonomous = async (id: string, autonomous: boolean) => {
    const res = await fetch(`/api/agents/jules-sessions/${id}/autonomous`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orchestratorAutonomous: autonomous })
    });
    if (!res.ok) throw new Error("Failed to update");
    return res.json();
};

// --- Components ---

function StatusBadge({ status }: { status: string }) {
    switch (status) {
        case 'active':
        case 'running':
            return <Badge variant="default" className="bg-blue-500/10 text-blue-400 border-blue-500/20"><Activity className="w-3 h-3 mr-1" /> Active</Badge>;
        case 'completed':
            return <Badge variant="default" className="bg-green-500/10 text-green-400 border-green-500/20"><CheckCircle className="w-3 h-3 mr-1" /> Completed</Badge>;
        case 'stuck':
        case 'blocked':
        case 'waiting_for_user':
            return <Badge variant="default" className="bg-orange-500/10 text-orange-400 border-orange-500/20"><AlertTriangle className="w-3 h-3 mr-1" /> Blocked</Badge>;
        case 'draft':
            return <Badge variant="outline" className="text-muted-foreground"><MessageSquare className="w-3 h-3 mr-1" /> Draft</Badge>;
        case 'failed':
            return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Failed</Badge>;
        default:
            return <Badge variant="secondary">{status}</Badge>;
    }
}

export default function JulesSessionsPage() {
    const queryClient = useQueryClient();
    const { data: sessions, isLoading } = useQuery({ queryKey: ['jules-sessions'], queryFn: fetchSessions });
    const [selectedThread, setSelectedThread] = useState<any>(null);
    const [isCreatingDraft, setIsCreatingDraft] = useState(false);

    // Draft form state
    const [repoUrl, setRepoUrl] = useState('');
    const [draftPrompt, setDraftPrompt] = useState('');

    // Assistant Runtime
    const [currentThreadState, setCurrentThreadState] = useState<JulesThread | null>(null);

    const runtime = useJulesRuntime(currentThreadState, (updated) => {
        setCurrentThreadState(updated);
        // Persist to local storage or db if needed, here we just keep in memory for draft demo
    });

    const createDraftMutation = useMutation({
        mutationFn: createDraftSession,
        onSuccess: (data: any) => {
            queryClient.invalidateQueries({ queryKey: ['jules-sessions'] });
            setSelectedThread(data);
            setIsCreatingDraft(false);
            setCurrentThreadState({
                id: data.id,
                repoUrl: `https://github.com/${data.repoOwner}/${data.repoName}`,
                messages: [{
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: `I've created a draft session for \`${data.repoOwner}/${data.repoName}\`. Let's refine your prompt. \n\nOriginal prompt: \n> ${data.prompt}\n\nWhat else should I consider?`,
                    createdAt: Date.now()
                }]
            });
            setRepoUrl('');
            setDraftPrompt('');
        },
        onError: () => toast.error("Failed to create draft session")
    });

    const autonomousMutation = useMutation({
        mutationFn: ({ id, auto }: { id: string, auto: boolean }) => updateAutonomous(id, auto),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jules-sessions'] })
    });

    const handleCreateDraft = () => {
        if (!repoUrl || !draftPrompt) {
            toast.error("Repo URL and prompt are required");
            return;
        }

        let owner = '', repo = '';
        try {
            const urlObj = new URL(repoUrl);
            const parts = urlObj.pathname.split('/').filter(Boolean);
            if (parts.length >= 2) {
                owner = parts[0];
                repo = parts[1];
            } else {
                throw new Error("Invalid format");
            }
        } catch {
            toast.error("Invalid GitHub URL format. Use https://github.com/owner/repo");
            return;
        }

        createDraftMutation.mutate({ repoOwner: owner, repoName: repo, prompt: draftPrompt });
    };

    const handleSelectSession = (session: any) => {
        setSelectedThread(session);
        setIsCreatingDraft(false);
        // In a real implementation we would fetch the conversation history for this session ID
        // For now, if it's not a draft or we don't have it in memory, we mock it.
        if (session.status !== 'draft') {
            setCurrentThreadState({
                id: session.id,
                repoUrl: `https://github.com/${session.repoOwner}/${session.repoName}`,
                messages: [{
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: `Monitoring active session for \`${session.repoOwner}/${session.repoName}\`. I am acting as the Orchestrator.`,
                    createdAt: Date.now()
                }]
            });
        }
    };

    // Auto-scroll chat
    const chatEndRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [runtime.messages, runtime.thinkingSteps]);

    const [chatInput, setChatInput] = useState('');

    return (
        <div className="flex flex-col h-full w-full bg-background overflow-hidden relative min-h-screen">
            {/* Top Navigation */}
            <div className="shrink-0 border-b bg-card/30 backdrop-blur px-4 pt-3">
                <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                        <BrainCircuit className="w-5 h-5 text-blue-500" />
                        <span className="font-semibold text-sm">Jules Orchestrator</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => { setIsCreatingDraft(true); setSelectedThread(null); }} className="h-7 text-xs gap-1">
                        <Plus className="w-3 h-3" /> New Session
                    </Button>
                </div>
                <CFCommandCenterNav activeTab="jules-sessions" />
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Left Sidebar: Session List */}
                <div className="w-80 border-r bg-muted/10 flex flex-col shrink-0">
                    <div className="p-3 border-b border-border/50 bg-card/50">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sessions</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {isLoading && <div className="text-sm text-muted-foreground p-4 text-center">Loading sessions...</div>}
                        {!isLoading && sessions?.length === 0 && (
                            <div className="text-sm text-muted-foreground p-4 text-center">No sessions found.</div>
                        )}
                        {sessions?.map((session: any) => (
                            <button
                                key={session.id}
                                onClick={() => handleSelectSession(session)}
                                className={cn(
                                    "w-full text-left p-3 rounded-lg border transition-all text-sm",
                                    selectedThread?.id === session.id
                                        ? "bg-card border-blue-500/40 shadow-sm"
                                        : "bg-transparent border-transparent hover:bg-card/50 hover:border-border/50"
                                )}
                            >
                                <div className="flex items-center justify-between mb-1.5">
                                    <Badge variant="outline" className="font-mono text-[10px] bg-background/50">
                                        <Github className="w-3 h-3 mr-1" />
                                        {session.repoName}
                                    </Badge>
                                    <StatusBadge status={session.status} />
                                </div>
                                <div className="line-clamp-2 text-xs text-foreground/80 mt-2 mb-2 leading-relaxed">
                                    {session.prompt}
                                </div>
                                <div className="text-[10px] text-muted-foreground flex justify-between">
                                    <span>{formatDistanceToNow(new Date(session.createdAt))} ago</span>
                                    {session.orchestratorAutonomous && <span className="text-blue-400">Autonomous</span>}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Right Area: Chat / Draft Form */}
                <div className="flex-1 flex flex-col relative bg-background/50">
                    {isCreatingDraft ? (
                        <div className="flex-1 p-6 flex flex-col items-center justify-center">
                            <div className="w-full max-w-lg p-6 rounded-xl border bg-card shadow-sm space-y-6">
                                <div>
                                    <h2 className="text-lg font-semibold flex items-center gap-2">
                                        <Bot className="w-5 h-5 text-blue-500" />
                                        Consult with Jules Orchestrator
                                    </h2>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        Let's refine your prompt and ensure Cloudflare best practices before dispatching to the coding agent.
                                    </p>
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="repo">GitHub Repository URL <span className="text-red-500">*</span></Label>
                                        <Input
                                            id="repo"
                                            placeholder="https://github.com/owner/repo"
                                            value={repoUrl}
                                            onChange={e => setRepoUrl(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="prompt">Initial Task Description <span className="text-red-500">*</span></Label>
                                        <Textarea
                                            id="prompt"
                                            placeholder="What should Jules build or fix?"
                                            rows={4}
                                            value={draftPrompt}
                                            onChange={e => setDraftPrompt(e.target.value)}
                                        />
                                    </div>
                                    <Button
                                        onClick={handleCreateDraft}
                                        disabled={createDraftMutation.isPending || !repoUrl || !draftPrompt}
                                        className="w-full"
                                    >
                                        {createDraftMutation.isPending ? "Creating..." : "Start Consultation"}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ) : selectedThread ? (
                        <div className="flex flex-col h-full">
                            {/* Thread Header */}
                            <div className="h-14 border-b flex items-center justify-between px-4 bg-card/40 shrink-0">
                                <div className="flex items-center gap-3">
                                    <Badge variant="outline" className="font-mono text-xs">
                                        <Github className="w-3.5 h-3.5 mr-1.5" />
                                        {selectedThread.repoOwner}/{selectedThread.repoName}
                                    </Badge>
                                    <StatusBadge status={selectedThread.status} />
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2">
                                        <Switch
                                            id="autonomous-mode"
                                            checked={selectedThread.orchestratorAutonomous}
                                            onCheckedChange={(c) => {
                                                setSelectedThread({ ...selectedThread, orchestratorAutonomous: c });
                                                autonomousMutation.mutate({ id: selectedThread.id, auto: c });
                                            }}
                                        />
                                        <Label htmlFor="autonomous-mode" className="text-xs font-medium cursor-pointer">
                                            Autonomous Agent
                                        </Label>
                                    </div>
                                </div>
                            </div>

                            {/* Chat Feed */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                                {runtime.messages.map((msg, i) => (
                                    <div key={msg.id || i} className={cn("flex gap-3 max-w-4xl mx-auto w-full", msg.role === 'user' ? "justify-end" : "justify-start")}>
                                        {msg.role === 'assistant' && (
                                            <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 mt-1">
                                                <Bot className="w-4 h-4 text-blue-500" />
                                            </div>
                                        )}
                                        <div className={cn("max-w-[85%] rounded-2xl px-4 py-3 shadow-sm",
                                            msg.role === 'user'
                                                ? "bg-blue-600 text-white rounded-br-none"
                                                : "bg-card border rounded-tl-none"
                                        )}>
                                            {msg.role === 'user' ? (
                                                <div className="whitespace-pre-wrap text-[14px] leading-relaxed">{msg.content}</div>
                                            ) : (
                                                <>
                                                    {msg.blocks && msg.blocks.length > 0 ? (
                                                        <JulesBlockContent blocks={msg.blocks} />
                                                    ) : (
                                                        <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed">
                                                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                                                        </div>
                                                    )}

                                                    {msg.modelUsed && (
                                                        <div className="text-[10px] text-muted-foreground/50 mt-2 font-mono text-right">
                                                            {msg.modelUsed}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                {runtime.thinkingSteps.length > 0 && (
                                    <div className="flex gap-3 max-w-4xl mx-auto w-full">
                                        <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 mt-1">
                                            <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                        </div>
                                        <div className="bg-muted/50 border rounded-2xl rounded-tl-none px-4 py-3 text-sm text-muted-foreground flex flex-col gap-1">
                                            {runtime.thinkingSteps.map((s, i) => (
                                                <span key={i} className="flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                                    {s.text}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div ref={chatEndRef} />
                            </div>

                            {/* Chat Input */}
                            <div className="shrink-0 p-4 border-t bg-card/30 backdrop-blur">
                                <div className="max-w-4xl mx-auto relative">
                                    <Textarea
                                        value={chatInput}
                                        onChange={e => setChatInput(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                if (chatInput.trim() && !runtime.isRunning) {
                                                    runtime.sendMessage(chatInput.trim());
                                                    setChatInput('');
                                                }
                                            }
                                        }}
                                        placeholder="Message Orchestrator or guide Jules..."
                                        className="resize-none pr-12 rounded-xl"
                                        rows={2}
                                    />
                                    <Button
                                        size="icon"
                                        className="absolute right-2 bottom-2 h-8 w-8 rounded-lg bg-blue-600 hover:bg-blue-700"
                                        disabled={!chatInput.trim() || runtime.isRunning}
                                        onClick={() => {
                                            runtime.sendMessage(chatInput.trim());
                                            setChatInput('');
                                        }}
                                    >
                                        <Send className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                            <LayoutDashboard className="w-12 h-12 mb-4 opacity-20" />
                            <p>Select a session or create a new one to get started.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
