import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export const PerformanceAnalytics = ({ agentId }: { agentId: string }) => {
    return (
        <Card className="dark w-full h-[400px] bg-[#0a0a0a] text-zinc-50 border-zinc-800 shadow-2xl flex flex-col relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-[100px] bg-gradient-to-b from-blue-900/10 to-transparent pointer-events-none" />
            <CardHeader className="border-b border-zinc-800/60 pb-5 bg-zinc-950/80 z-10 relative flex-none">
                <div className="flex justify-between items-center">
                    <CardTitle className="text-xl font-extrabold tracking-tight">Velocity Trends</CardTitle>
                    <span className="text-xs font-mono font-bold tracking-wider text-blue-400/80 px-3 py-1 bg-blue-950/30 border border-blue-900/50 rounded-full uppercase">Agent: {agentId}</span>
                </div>
            </CardHeader>
            <CardContent className="flex-1 p-6 relative flex items-end justify-between gap-3 opacity-90 z-10 bg-transparent">
                {[40, 60, 45, 80, 55, 90, 75, 100, 85, 65, 50, 70].map((h, i) => (
                    <div key={i} className="w-full bg-blue-900/30 rounded-t-md hover:bg-blue-500/60 transition-all duration-300 relative group border-t border-blue-500/20 shadow-[0_-5px_15px_rgba(59,130,246,0.1)]" style={{ height: `${h}%` }}>
                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-zinc-800/90 text-xs px-2.5 py-1 rounded backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 font-mono border border-zinc-700 pointer-events-none shadow-lg">
                            {h} tasks
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
};
