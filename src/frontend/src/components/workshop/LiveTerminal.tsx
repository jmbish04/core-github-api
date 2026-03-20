import React, { useEffect, useRef, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export const LiveTerminal = ({ projectId }: { projectId: string }) => {
    const [logs, setLogs] = useState<string[]>([]);
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Connect to WebSocket
        const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws?projectId=${projectId}`;
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            setLogs(prev => [...prev, '> Connection established to Agent DO']);
        };

        ws.onmessage = (event) => {
            setLogs(prev => [...prev, `> ${event.data}`]);
        };

        ws.onerror = (e) => {
            setLogs(prev => [...prev, '> [ERROR] Terminal connection failing... fallback to polling.']);
        };

        ws.onclose = () => {
            setLogs(prev => [...prev, '> Connection closed']);
        };

        return () => ws.close();
    }, [projectId]);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    return (
        <Card className="dark w-full h-[500px] flex flex-col bg-[#0a0a0a] border-zinc-900 shadow-2xl overflow-hidden rounded-md font-mono">
            <CardHeader className="p-3 border-b border-zinc-800/80 bg-zinc-950/50 flex-none flex flex-row items-center gap-3">
                <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500/80" />
                    <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                    <div className="w-3 h-3 rounded-full bg-green-500/80" />
                </div>
                <CardTitle className="text-xs text-zinc-500 font-medium tracking-widest pl-2 uppercase">bash — agent-runtime</CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex-1 overflow-y-auto bg-transparent relative">
                <div className="absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-[#0a0a0a] to-transparent pointer-events-none" />
                <div className="space-y-1.5 min-h-full pb-4">
                    {logs.map((log, i) => (
                        <div key={i} className="text-sm text-green-400/90 whitespace-pre-wrap leading-relaxed break-all">
                            {log}
                        </div>
                    ))}
                    {logs.length === 0 && (
                        <div className="text-sm text-zinc-600 animate-pulse">Waiting for execution context...</div>
                    )}
                    <div ref={endRef} />
                </div>
            </CardContent>
        </Card>
    );
};
