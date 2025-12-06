import React, { useState, useRef, useEffect } from 'react';
import { MessageBubble } from './message-bubble';
import { Send, Upload, Square } from 'lucide-react';

interface ChatInterfaceProps {
    apiKey: string;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ apiKey }) => {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMsg = { role: 'user', content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey
                },
                body: JSON.stringify({
                    message: userMsg.content,
                    sessionId,
                    history: messages // Pass history to maintain context if backend needs it (though DO has state)
                })
            });

            if (!res.ok) throw new Error(await res.text());

            const data = await res.json();

            // Update session ID if new
            if (data.sessionId) setSessionId(data.sessionId);

            // Backend returns full history, but we might want to just append the new messages 
            // or replace entirely. Replacing ensures we see tool calls that happened on backend.
            // However, backend 'history' format might differ slightly from our local state depending on how GeminiAgent constructs it.
            // GeminiAgent returns { history: [...] } which includes the new interaction.
            if (data.history) {
                setMessages(data.history);
            } else {
                // Fallback
                setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
            }

        } catch (error: any) {
            console.error(error);
            setMessages(prev => [...prev, { role: 'system', content: `Error: ${error.message}` }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-screen bg-background text-foreground">
            {/* Header */}
            <header className="h-14 border-b px-6 flex items-center justify-between bg-card/50 backdrop-blur sticky top-0 z-10">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="font-semibold text-sm">Gemini Agent</span>
                    {sessionId && <span className="text-xs text-muted-foreground ml-2">#{sessionId.slice(0, 8)}</span>}
                </div>
            </header>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:px-40 scroll-smooth">
                {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
                        <div className="p-4 bg-secondary rounded-full">
                            <Upload className="h-8 w-8" />
                        </div>
                        <p>Send a message to start checking your repositories.</p>
                    </div>
                ) : (
                    <div className="space-y-6 max-w-3xl mx-auto pb-4">
                        {messages.map((m, i) => (
                            <MessageBubble key={i} role={m.role} content={m.content} />
                        ))}
                        {isLoading && (
                            <div className="flex gap-4 my-6">
                                <div className="shrink-0 h-8 w-8 rounded-full bg-accent flex items-center justify-center">
                                    <BotIcon />
                                </div>
                                <div className="flex items-center gap-1">
                                    <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                            </div>
                        )}
                        <div ref={bottomRef} />
                    </div>
                )}
            </div>

            {/* Input */}
            <div className="p-4 border-t bg-background/50 backdrop-blur">
                <form onSubmit={handleSubmit} className="max-w-3xl mx-auto relative flex items-end gap-2 p-2 rounded-xl border bg-card shadow-sm focus-within:ring-1 focus-within:ring-ring">
                    <textarea
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        className="flex-1 bg-transparent border-none focus:ring-0 resize-none min-h-[44px] max-h-[200px] py-3 px-2"
                        placeholder="How can I help you today?"
                        rows={1}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit(e);
                            }
                        }}
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !input.trim()}
                        className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed mb-1"
                    >
                        {isLoading ? <Square className="h-4 w-4 animate-pulse" /> : <Send className="h-4 w-4" />}
                    </button>
                </form>
                <div className="text-center mt-2">
                    <span className="text-[10px] text-muted-foreground">AI can make mistakes. Check important info.</span>
                </div>
            </div>
        </div>
    );
};

const BotIcon = () => (
    <svg className="w-5 h-5 text-accent-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" /><path d="m8 22 4-9 4 9" /><path d="M8 13.5A2.5 2.5 0 0 0 5.5 16v1a2 2 0 0 0 2 2h8.5" /><path d="M12 13.5h0" /><path d="M11 6h2" /><path d="M17 19.5V22" /></svg>
)
