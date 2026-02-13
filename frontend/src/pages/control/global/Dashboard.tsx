import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LucideActivity, LucideShieldCheck } from "lucide-react";
import { useState } from "react";
import { RepoHealthCard } from "@/components/RepoHealthCard";
import { AgentWorkflowTimeline } from "@/components/AgentWorkflowTimeline";
import { RecentTasksCard } from "@/components/RecentTasksCard";
import { LiveOpsModal } from "@/components/modals/LiveOpsModal";
import { WorkflowsModal } from "@/components/modals/WorkflowsModal";

export default function DashboardPage() {
    const [activeOp, setActiveOp] = useState<string | null>(null);

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
            <header className="border-b border-zinc-800 py-4 px-6 flex items-center justify-between bg-zinc-900/50 backdrop-blur-sm">
                <div className="flex items-center gap-4">
                    <h1 className="text-xl font-bold tracking-tight">Dashboard</h1>
                    <div className="h-6 w-px bg-zinc-800" />
                    <div className="flex items-center gap-2">
                        <LiveOpsModal activeOpCount={activeOp ? 1 : 0} />
                        <WorkflowsModal />
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="default" size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={startFix}>
                        Auto-Fix Repo
                    </Button>
                </div>
            </header>

            <main className="flex-1 overflow-hidden p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">

                    {/* Left Column: Repository Health */}
                    <div className="flex flex-col gap-6">
                        <RepoHealthCard owner="jmbish04" repo="core-github-api" />
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
                            {/* Reusing AgentWorkflowTimeline directly in dashboard as the main feed */}
                            <div className="flex-1 p-0 overflow-hidden relative">
                                <AgentWorkflowTimeline operationId={activeOp || "demo-op"} />
                            </div>
                        </Card>
                    </div>

                    {/* Right Column: Recent Tasks (Simplified Kanban) */}
                    <div className="flex flex-col gap-6 overflow-hidden">
                        <RecentTasksCard />
                    </div>

                </div>
            </main>
        </div>
    );
}
