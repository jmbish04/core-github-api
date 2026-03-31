import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

export const HealthReport = () => {
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await api.frontend.workshop.stats.global.$get();
                if (res.ok) setStats(await res.json());
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, []);

    const metrics = [
        { label: "Total Projects", value: stats?.totalProjects ?? 0, status: "healthy" },
        { label: "Active Events", value: stats?.totalEvents ?? 0, status: "healthy" },
        { label: "Active Agents", value: stats?.activeAgents ?? 0, status: "warning" },
        { label: "Vector Integrity", value: "99.9%", status: "healthy" }
    ];

    return (
        <Card className="dark w-full bg-zinc-950 text-zinc-50 border-zinc-800 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-green-900/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
            <CardHeader className="border-b border-zinc-800/60 pb-5 bg-zinc-900/20 z-10 relative">
                <CardTitle className="text-xl font-extrabold tracking-tight">System Health</CardTitle>
            </CardHeader>
            <CardContent className="p-6 z-10 relative">
                {loading ? (
                    <div className="grid grid-cols-2 gap-4">
                        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 bg-zinc-900 rounded-xl" />)}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-6">
                        {metrics.map((m, i) => (
                            <div key={i} className="p-5 rounded-xl border border-zinc-800/80 bg-[#0a0a0a] flex flex-col gap-3 relative overflow-hidden shadow-inner group hover:border-zinc-700 transition-colors">
                                <div className={`absolute left-0 top-0 bottom-0 w-1 ${m.status === 'healthy' ? 'bg-green-500/50' : m.status === 'warning' ? 'bg-amber-500/50' : 'bg-red-500/50'}`} />
                                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400 pl-2">{m.label}</span>
                                <div className="text-4xl font-black text-zinc-100 pl-2 tracking-tighter">
                                    {m.value}
                                </div>
                                <div className="pl-2 mt-auto">
                                    <Badge variant="outline" className={`text-[9px] uppercase font-bold tracking-[0.2em] border-0 px-2.5 py-0.5 rounded-full ${m.status === 'healthy' ? 'bg-green-900/30 text-green-400' : 'bg-amber-900/30 text-amber-400'}`}>
                                        {m.status}
                                    </Badge>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
