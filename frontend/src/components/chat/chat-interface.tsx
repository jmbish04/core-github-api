import React, { useState, useEffect } from 'react';
import { Message, PromptInput, ModelSelector } from '@/components/ui/ai-elements/idx';
import { Plus, MessageSquare, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface ChatInterfaceProps {
    apiKey?: string;
}

interface Thread {
    id: string;
    subject: string | null;
    timestampStarted: string;
}

interface ChatMessage {
    id: number;
    threadId: string;
    role: 'user' | 'agent' | 'system';
    content: string;
    timestamp: string;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ apiKey }) => {
    const [threads, setThreads] = useState<Thread[]>([]);
    const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isThreadsLoading, setIsThreadsLoading] = useState(false);

    // Fetch Threads
    useEffect(() => {
        fetchThreads();
    }, []);

    const fetchThreads = async () => {
        setIsThreadsLoading(true);
        try {
            const res = await fetch('/api/chat/threads', {
                headers: { 'x-api-key': apiKey || '' }
            });
            if (res.ok) {
                const data = await res.json();
                setThreads(data);
                // Auto-select most recent if none selected
                if (!activeThreadId && data.length > 0) {
                    setActiveThreadId(data[0].id);
                }
            }
        } catch (e) {
            console.error("Failed to fetch threads", e);
        } finally {
            setIsThreadsLoading(false);
        }
    };

    // Fetch Messages when active thread changes
    useEffect(() => {
        if (!activeThreadId) {
            setMessages([]);
            return;
        }

        const fetchMessages = async () => {
            setIsLoading(true);
            try {
                const res = await fetch(`/api/chat/threads/${activeThreadId}/messages`, {
                    headers: { 'x-api-key': apiKey || '' }
                });
                if (res.ok) {
                    const data = await res.json();
                    setMessages(data);
                }
            } catch (e) {
                console.error("Failed to fetch messages", e);
            } finally {
                setIsLoading(false);
            }
        };

        fetchMessages();
    }, [activeThreadId, apiKey]);

    const handleCreateThread = async () => {
        try {
            const res = await fetch('/api/chat/threads', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey || ''
                },
                body: JSON.stringify({ subject: 'New Discussion' })
            });
            if (res.ok) {
                const newThread = await res.json();
                setThreads(prev => [newThread, ...prev]);
                setActiveThreadId(newThread.id);
            }
        } catch (e) {
            console.error("Failed to create thread", e);
        }
    };

    const handleSendMessage = async (text: string) => {
        if (!activeThreadId) return;

        // Optimistic UI
        const optimisticMsg: ChatMessage = {
            id: Date.now(),
            threadId: activeThreadId,
            role: 'user',
            content: text,
            timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, optimisticMsg]);
        setIsLoading(true);

        try {
            const res = await fetch(`/api/chat/threads/${activeThreadId}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey || ''
                },
                body: JSON.stringify({ content: text })
            });

            if (res.ok) {
                const newMessages = await res.json();
                // Replace optimistic or append. DB returns [userMsg, agentMsg].
                // We'll just append the agent message since we showed user one.
                const agentMsg = newMessages.find((m: any) => m.role === 'agent');
                if (agentMsg) {
                    setMessages(prev => [...prev, agentMsg]);
                }
            }
        } catch (e) {
            console.error("Failed to send message", e);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex h-[calc(100vh-6rem)] bg-background border rounded-xl overflow-hidden shadow-sm">
            {/* Thread List Sidebar */}
            <div className="w-80 border-r bg-muted/10 flex flex-col">
                <div className="p-4 border-b flex items-center justify-between bg-background/50 backdrop-blur">
                    <span className="font-semibold text-sm">Discussions</span>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCreateThread}>
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {isThreadsLoading && <div className="p-4 text-center text-xs text-muted-foreground">Loading...</div>}
                    {threads.map(thread => (
                        <button
                            key={thread.id}
                            onClick={() => setActiveThreadId(thread.id)}
                            className={cn(
                                "w-full text-left p-3 rounded-lg text-sm transition-colors flex items-start gap-3",
                                activeThreadId === thread.id
                                    ? "bg-primary/10 text-primary font-medium"
                                    : "hover:bg-muted/50 text-muted-foreground"
                            )}
                        >
                            <MessageSquare className="w-4 h-4 mt-0.5 shrink-0 opactiy-70" />
                            <div className="overflow-hidden">
                                <div className="truncate">{thread.subject || "Untitled Discussion"}</div>
                                <div className="text-[10px] opacity-70 mt-1">
                                    {formatDistanceToNow(new Date(thread.timestampStarted), { addSuffix: true })}
                                </div>
                            </div>
                        </button>
                    ))}
                    {!isThreadsLoading && threads.length === 0 && (
                        <div className="p-8 text-center text-xs text-muted-foreground">
                            No threads yet.
                        </div>
                    )}
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col bg-background">
                {/* Header */}
                <div className="h-14 border-b flex items-center justify-between px-6 bg-background/80 backdrop-blur">
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                            {threads.find(t => t.id === activeThreadId)?.subject || "Select a discussion"}
                        </span>
                    </div>
                    <ModelSelector defaultValue="gemini-2.0-flash-exp" />
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
                    {!activeThreadId ? (
                        <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4">
                            <MessageSquare className="w-12 h-12 opacity-20" />
                            <p>Select a thread to start chatting</p>
                        </div>
                    ) : (
                        <>
                            {messages.map((msg) => (
                                <Message
                                    key={msg.id}
                                    role={msg.role === 'agent' ? 'assistant' : msg.role as any}
                                    content={msg.content}
                                />
                            ))}
                            {isLoading && (
                                <div className="flex items-center gap-2 text-muted-foreground text-xs ml-4 animate-pulse">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Thinking...
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Input */}
                <div className="p-4 border-t bg-muted/10">
                    <div className="max-w-3xl mx-auto">
                        <PromptInput
                            onSend={handleSendMessage}
                            isLoading={isLoading}
                            placeholder={activeThreadId ? "Type a message..." : "Select a thread first..."}
                            className={!activeThreadId ? "opacity-50 pointer-events-none" : ""}
                        />
                    </div>
                    <div className="text-center mt-2">
                        <span className="text-[10px] text-muted-foreground">Powered by Gemini 2.0 Flash • Full Context Awareness</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
