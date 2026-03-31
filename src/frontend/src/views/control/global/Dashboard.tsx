import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LucideActivity, LucideShieldCheck } from "lucide-react";
import { useState } from "react";
import { RepoHealthCard } from "@/components/RepoHealthCard";
import { RecentTasksCard } from "@/components/RecentTasksCard";
import { LiveOpsModal } from "@/components/modals/LiveOpsModal";
import { WorkflowsModal } from "@/components/modals/WorkflowsModal";
import { CloudflareFleetSpendSummary } from "@/components/cloudflaresdk/CloudflareFleetSpendSummary";
import { useProjectStore } from "@/stores/useProjectStore";
import { api } from "@/lib/api-client";
import { useQuery } from "@tanstack/react-query";
import { LucideBot, LucideUser, LucideClock3 } from "lucide-react";

function RecentWorkshopActivity() {
    const { data, isLoading } = useQuery({
        queryKey: ['workshop', 'recent-events'],
        queryFn: async () => {
             const res = await api.frontend.workshop.events.recent.$get({});
             if (!res.ok) return [];
             const ds = await res.json();
             return ds.events;
        },
        refetchInterval: 10000
    });

    if (isLoading) return <div className="p-4 flex items-center justify-center text-zinc-500"><LucideClock3 className="animate-spin w-4 h-4 mr-2"/>Loading...</div>;
    
    if (!data || data.length === 0) return <div className="p-4 text-xs text-zinc-500">No agent activity found.</div>;

    return (
        <ScrollArea className="flex-1 p-0">
            <div className="divide-y divide-zinc-800/50">
                {data.map((event: any) => {
                     const isSystem = event.actor === 'system';
                     const Icon = isSystem ? LucideBot : LucideUser;
                     return (
                         <div key={event.id} className="p-3 text-sm flex gap-3 hover:bg-zinc-800/20 transition-colors">
                             <div className={cn("mt-0.5 shrink-0 p-1.5 rounded-md", isSystem ? "bg-indigo-500/20 text-indigo-400" : "bg-zinc-800 text-zinc-400")}>
                                 <Icon className="w-3.5 h-3.5"/>
                             </div>
                             <div className="flex-1 min-w-0">
                                 <div className="flex items-center justify-between gap-2">
                                     <div className="font-medium text-zinc-200 capitalize truncate">{event.projectName || 'Draft Project'}</div>
                                     <div className="text-[10px] text-zinc-500 shrink-0">{new Date(event.createdAt).toLocaleTimeString([], {timeStyle: 'short'})}</div>
                                 </div>
                                 <div className="text-zinc-400 text-xs mt-0.5 truncate">{event.type || 'Action'}: {event.content?.action || 'Update'}</div>
                             </div>
                         </div>
                     );
                })}
            </div>
        </ScrollArea>
    );
}

import { cn } from "@/lib/utils";

export default function DashboardPage() {
    const [activeOp, setActiveOp] = useState<string | null>(null);
    const { activeProjects } = useProjectStore();
    const primaryProject = activeProjects[0] || { owner: 'colby-dev', name: 'core-api' };

    const startFix = () => {
        const id = `fix-all-${Date.now()}`;
        setActiveOp(id);
        // In real app, trigger backend here.
        // For LiveOpsModal to pick this up, we'd likely pass this state down or use a global store.
        // For now, modal will just show generic console.
    };

    return (
        <div className="flex flex-col h-screen bg-zinc-950 text-zinc-50 font-sans">
            {/* Header / Toolbar */}
            <header className="border-b border-zinc-800 py-4 px-4 md:px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-zinc-900/50 backdrop-blur-sm">
                <div className="flex flex-wrap items-center gap-2 sm:gap-4 w-full sm:w-auto">
                    <h1 className="text-xl font-bold tracking-tight">Dashboard</h1>
                    <div className="hidden sm:block h-6 w-px bg-zinc-800" />
                    <div className="flex items-center gap-2 ml-auto sm:ml-0">
                        <LiveOpsModal activeOpCount={activeOp ? 1 : 0} />
                        <WorkflowsModal />
                    </div>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <Button variant="default" size="sm" className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto" onClick={startFix}>
                        Auto-Fix Repo
                    </Button>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto md:overflow-hidden p-4 md:p-6">
                <div className="space-y-6 h-full min-h-min">
                    <CloudflareFleetSpendSummary />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:h-[calc(100%-9rem)]">

                    {/* Left Column: Repository Health */}
                    <div className="flex flex-col gap-6">
                        <RepoHealthCard owner={primaryProject.owner} repo={primaryProject.name} />
                        <Card className="border-zinc-800 bg-zinc-900/50">
                            <CardHeader>
                                <CardTitle className="text-sm font-medium text-zinc-400">Security Status</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-4">
                                    <LucideShieldCheck className="w-8 h-8 text-emerald-500" />
                                    <div>
                                        <div className="text-2xl font-bold text-zinc-100">Passing</div>
                                        <div className="text-xs text-zinc-500">Last scan 2h ago</div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Middle Column: Activity Feed / Agent Timeline */}
                    <div className="flex flex-col gap-6 overflow-hidden">
                        <Card className="flex-1 flex flex-col border-zinc-800 bg-zinc-900/50 overflow-hidden">
                            <CardHeader className="py-3 px-4 border-b border-zinc-800/50">
                                <CardTitle className="flex items-center gap-2 text-sm">
                                    <LucideActivity className="w-4 h-4 text-blue-400" />
                                    Agent Activity
                                </CardTitle>
                            </CardHeader>
                            {/* Unified view: Workshop Activity Feed */}
                            <RecentWorkshopActivity />
                        </Card>
                    </div>

                    {/* Right Column: Recent Tasks (Simplified Kanban) */}
                    <div className="flex flex-col gap-6 overflow-hidden">
                        <RecentTasksCard />
                    </div>

                </div>
                </div>
            </main>
        </div>
    );
}
