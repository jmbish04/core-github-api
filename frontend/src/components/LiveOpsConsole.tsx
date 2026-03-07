
// frontend/src/components/LiveOpsConsole.tsx
import { useEffect, useRef, useState } from 'react';
import { useColbySocket } from '@/hooks/useColbySocket';
import { Card, CardHeader, CardContent, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ContainerStatusBadge } from './ContainerStatusBadge';
import { StopCircle, MessageSquare, Send, RotateCcw } from 'lucide-react';
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@/components/ui/empty";
import { Terminal as TerminalIcon } from "lucide-react";

interface LiveOpsConsoleProps {
    operationId?: string;
}

export function LiveOpsConsole({ operationId }: LiveOpsConsoleProps) {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<any | null>(null);
    const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'failed' | 'intervention_needed'>('idle');
    const [messages, setMessages] = useState<{ role: 'user' | 'ai', content: string }[]>([]);
    const [input, setInput] = useState('');

    // Control Socket for Status & Chat
    const { lastMessage, sendMessage, isConnected } = useColbySocket({
        url: operationId
            ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/ops/${operationId}/console?type=control`
            : '',
        autoConnect: !!operationId,
        onMessage: (data) => {
            if (data.type === 'status') {
                setStatus(data.status);
            } else if (data.type === 'chat') {
                setMessages(prev => [...prev, { role: data.role, content: data.content }]);
            }
        }
    });

    useEffect(() => {
        if (!terminalRef.current || !operationId) return;

        let cleanup: (() => void) | undefined;
        let isMounted = true;

        (async () => {
            const [{ Terminal: XTerm }, { FitAddon }, { AttachAddon }] = await Promise.all([
                import('@xterm/xterm'),
                import('@xterm/addon-fit'),
                import('@xterm/addon-attach'),
            ]);
            await import('@xterm/xterm/css/xterm.css');
            if (!isMounted || !terminalRef.current) return;

            // 1. Initialize Xterm
            const term = new XTerm({
                cursorBlink: true,
                theme: { background: '#09090b' },
                fontFamily: 'Menlo, Monaco, "Courier New", monospace',
                fontSize: 12,
            });

            const fitAddon = new FitAddon();
            term.loadAddon(fitAddon);

            // 2. Connect Terminal Socket (Raw PTY)
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.host;
            const socketUrl = `${protocol}//${host}/api/ops/${operationId}/console?type=terminal`; // Explicitly 'terminal'

            console.log(`[LiveOps] Connecting Terminal to ${socketUrl}`);
            const socket = new WebSocket(socketUrl);

            const attachAddon = new AttachAddon(socket);
            term.loadAddon(attachAddon);

            term.open(terminalRef.current);
            fitAddon.fit();
            xtermRef.current = term;

            const resizeObserver = new ResizeObserver(() => fitAddon.fit());
            resizeObserver.observe(terminalRef.current);

            cleanup = () => {
                socket.close();
                term.dispose();
                resizeObserver.disconnect();
            };
        })().catch((error) => {
            console.error('[LiveOps] Failed to initialize terminal', error);
        });

        return () => {
            isMounted = false;
            cleanup?.();
        };
    }, [operationId]);

    const handleSendMessage = () => {
        if (!input.trim()) return;
        sendMessage({ type: 'chat', message: input });
        setInput('');
    };

    const handleKill = async () => {
        if (!confirm("Are you sure you want to Kill this container?")) return;
        await fetch(`/api/ops/${operationId}/kill`, { method: 'POST' });
    };

    return (
        <div className="flex h-full gap-4">
            {/* Main Terminal Area */}
            <Card className="flex-1 flex flex-col border-zinc-800 bg-zinc-950 min-h-[400px]">
                <CardHeader className="py-2 px-4 border-b border-zinc-800 flex flex-row items-center justify-between h-14">
                    <div className="flex items-center gap-4">
                        <CardTitle className="text-sm font-mono text-zinc-400">
                            Op: {operationId}
                        </CardTitle>
                        <ContainerStatusBadge status={status} runtime={0} />
                    </div>
                    <div className="flex gap-2">
                        <Button variant="destructive" size="sm" onClick={handleKill} className="h-7 text-xs">
                            <StopCircle className="w-3 h-3 mr-1" /> Kill
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="flex-1 p-0 overflow-hidden relative">
                    {!operationId ? (
                        <Empty className="border-none">
                            <EmptyHeader>
                                <EmptyMedia variant="icon">
                                    <TerminalIcon />
                                </EmptyMedia>
                                <EmptyTitle>No Active Operation</EmptyTitle>
                                <EmptyDescription>
                                    Start a new workflow from the Command Center or select an active task to view real-time logs.
                                </EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    ) : (
                        <div ref={terminalRef} className="absolute inset-0 p-4" />
                    )}
                </CardContent>
            </Card>

            {/* AI Supervisor Chat */}
            <Card className="w-80 flex flex-col border-zinc-800 bg-zinc-900/50">
                <CardHeader className="py-3 px-4 border-b border-zinc-800">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-purple-400" /> Supervisor AI
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 p-0 overflow-hidden">
                    <ScrollArea className="h-full p-4 space-y-4">
                        {messages.length === 0 && (
                            <div className="text-center text-zinc-500 text-xs mt-10">
                                Ask the AI Manager to analyze logs or explain the current task.
                            </div>
                        )}
                        {messages.map((m, i) => (
                            <div key={i} className={`flex flex-col gap-1 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                                <div className={`text-xs px-3 py-2 rounded-lg max-w-[90%] ${m.role === 'user'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-zinc-800 text-zinc-300'
                                    }`}>
                                    {m.content}
                                </div>
                            </div>
                        ))}
                    </ScrollArea>
                </CardContent>
                <CardFooter className="p-3 border-t border-zinc-800">
                    <form
                        className="flex w-full gap-2"
                        onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
                    >
                        <Input
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            placeholder="Ask Supervisor..."
                            className="h-8 text-xs bg-zinc-950 border-zinc-700"
                        />
                        <Button type="submit" size="icon" className="h-8 w-8">
                            <Send className="w-3 h-3" />
                        </Button>
                    </form>
                </CardFooter>
            </Card>
        </div>
    );
}
