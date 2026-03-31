import React, { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api-client';
import { Progress } from '@/components/ui/progress';

export const DeploymentAnimation = ({ projectId }: { projectId: string }) => {
    const [events, setEvents] = useState<any[]>([]);
    const [progress, setProgress] = useState(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        const pollEvents = async () => {
            try {
                const res = await api.frontend.workshop['project'][':id']['events'].$get({ param: { id: projectId } });
                if (res.ok) {
                    const data = await res.json();
                    setEvents(data.events);
                    
                    const newProgress = Math.min((data.events.length / 5) * 100, 100);
                    setProgress(newProgress);

                    if (newProgress >= 100) {
                        if (intervalRef.current) clearInterval(intervalRef.current);
                        setTimeout(() => {
                            window.location.href = `/projects/default/default/workshop`;
                        }, 1500);
                    }
                }
            } catch (err) {
                console.error("Polling error", err);
            }
        };

        pollEvents();
        intervalRef.current = setInterval(pollEvents, 2500);
        
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [projectId]);

    return (
        <div className="dark fixed inset-0 z-[100] bg-zinc-950 flex flex-col items-center justify-center p-6 text-zinc-50 overflow-hidden">
            <div className="absolute inset-0 w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/10 via-zinc-950 to-zinc-950 pointer-events-none"></div>
            
            <div className="z-10 w-full max-w-xl space-y-10 animate-in fade-in zoom-in-95 duration-1000">
                <div className="text-center space-y-3">
                    <div className="mx-auto w-20 h-20 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-8 shadow-[0_0_40px_rgba(59,130,246,0.15)] relative">
                        <div className="absolute inset-0 border border-blue-400/30 rounded-2xl animate-ping opacity-20" style={{ animationDuration: '3s' }} />
                        <span className="text-4xl filter drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]">🚀</span>
                    </div>
                    <h1 className="text-4xl font-extrabold tracking-tight text-white mb-1">Provisioning Workspace...</h1>
                    <p className="text-xs font-mono text-blue-400/80 uppercase tracking-widest">Establishing secure neural links</p>
                </div>

                <div className="space-y-6 pt-8 max-w-lg mx-auto">
                    <Progress value={progress} className="h-1.5 bg-zinc-900" />
                    
                    <div className="h-48 overflow-hidden relative rounded-lg border border-zinc-800/80 bg-[#0a0a0a] shadow-inner font-mono p-4">
                        <div className="absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-[#0a0a0a] to-transparent z-10 pointer-events-none" />
                        <div className="absolute bottom-0 w-full pb-4 space-y-2.5 flex flex-col justify-end min-h-full">
                            {events.slice(-6).map((e, i) => (
                                <div key={i} className="text-xs text-zinc-400 animate-in fade-in slide-in-from-bottom-1 duration-300 flex gap-4">
                                    <span className="text-blue-500/70 whitespace-nowrap opacity-75">[{new Date(e.createdAt).toLocaleTimeString([], { hour12: false })}]</span>
                                    <span className="text-zinc-300 min-w-16 opacity-90">{e.type}:</span>
                                    <span className="truncate opacity-80">{typeof e.content === 'object' ? JSON.stringify(e.content) : e.content}</span>
                                </div>
                            ))}
                            {events.length === 0 && (
                                <span className="text-xs text-zinc-600 animate-pulse pb-1">Waiting for telemetry stream...</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
