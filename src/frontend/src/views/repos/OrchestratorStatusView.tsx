/**
 * @file src/frontend/src/views/repos/OrchestratorStatusView.tsx
 * @description Live Simulator — real-time visualization of the MMoE agent
 *              hierarchy. Shows milestones, ChatRoom messages, and agent health.
 */

import { useState } from "react";
import { useOrchestratorStatus, type MilestoneEvent } from "@/hooks/useOrchestratorStatus";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, CheckCircle2, XCircle, Clock, AlertTriangle, Loader2 } from "lucide-react";

const statusConfig: Record<MilestoneEvent["status"], { icon: React.ElementType; color: string; label: string }> = {
  staged: { icon: Clock, color: "text-zinc-400", label: "Staged" },
  in_progress: { icon: Loader2, color: "text-blue-400", label: "In Progress" },
  pending_review: { icon: AlertTriangle, color: "text-amber-400", label: "Review" },
  blocked: { icon: XCircle, color: "text-red-400", label: "Blocked" },
  complete: { icon: CheckCircle2, color: "text-emerald-400", label: "Complete" },
  failed: { icon: XCircle, color: "text-red-500", label: "Failed" },
};

function MilestoneRow({ milestone }: { milestone: MilestoneEvent }) {
  const config = statusConfig[milestone.status];
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-md bg-zinc-900/50 border border-zinc-800">
      <Icon
        className={`h-4 w-4 ${config.color} ${milestone.status === "in_progress" ? "animate-spin" : ""}`}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-mono text-zinc-200 truncate">{milestone.name}</p>
        {milestone.detail && (
          <p className="text-xs text-zinc-500 truncate">{milestone.detail}</p>
        )}
      </div>
      <Badge
        variant="outline"
        className={`text-xs ${config.color} border-zinc-700`}
      >
        {config.label}
      </Badge>
      <span className="text-xs text-zinc-600 tabular-nums">
        {new Date(milestone.timestamp).toLocaleTimeString()}
      </span>
    </div>
  );
}

export function OrchestratorStatusView() {
  const [requestId, setRequestId] = useState("");
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-2">
        <Activity className="h-6 w-6 text-emerald-400" />
        <h1 className="text-2xl font-bold text-zinc-100">Live Simulator</h1>
      </div>

      <Card className="bg-zinc-950 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-zinc-200">Connect to Sprint</CardTitle>
          <CardDescription className="text-zinc-500">
            Enter a request ID to observe the agent hierarchy in real-time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Request ID (e.g. sprint-001)"
              value={requestId}
              onChange={(e) => setRequestId(e.target.value)}
              className="bg-zinc-900 border-zinc-700 text-zinc-200"
            />
            <Button
              onClick={() => setActiveRequestId(requestId)}
              disabled={!requestId}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Connect
            </Button>
          </div>
        </CardContent>
      </Card>

      {activeRequestId && <LiveView requestId={activeRequestId} />}
    </div>
  );
}

function LiveView({ requestId }: { requestId: string }) {
  const { connected, milestones, messages } = useOrchestratorStatus(requestId);

  const completedCount = milestones.filter((m) => m.status === "complete").length;
  const failedCount = milestones.filter((m) => m.status === "failed").length;
  const activeCount = milestones.filter((m) => m.status === "in_progress").length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Stats Row */}
      <Card className="bg-zinc-950 border-zinc-800">
        <CardContent className="pt-6">
          <div className="text-center">
            <p className="text-3xl font-bold text-emerald-400">{completedCount}</p>
            <p className="text-sm text-zinc-500">Completed</p>
          </div>
        </CardContent>
      </Card>
      <Card className="bg-zinc-950 border-zinc-800">
        <CardContent className="pt-6">
          <div className="text-center">
            <p className="text-3xl font-bold text-blue-400">{activeCount}</p>
            <p className="text-sm text-zinc-500">In Progress</p>
          </div>
        </CardContent>
      </Card>
      <Card className="bg-zinc-950 border-zinc-800">
        <CardContent className="pt-6">
          <div className="text-center">
            <p className="text-3xl font-bold text-red-400">{failedCount}</p>
            <p className="text-sm text-zinc-500">Failed</p>
          </div>
        </CardContent>
      </Card>

      {/* Milestones */}
      <Card className="col-span-full bg-zinc-950 border-zinc-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-zinc-200">Milestones</CardTitle>
            <Badge variant={connected ? "default" : "destructive"} className="text-xs">
              {connected ? "🟢 Live" : "🔴 Disconnected"}
            </Badge>
          </div>
          <CardDescription className="text-zinc-500">
            Request: <code className="text-zinc-400">{requestId}</code>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            {milestones.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-zinc-600">
                <p>Waiting for milestones...</p>
              </div>
            ) : (
              <div className="space-y-2">
                {milestones.map((m, i) => (
                  <MilestoneRow key={`${m.name}-${i}`} milestone={m} />
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Message Log */}
      <Card className="col-span-full bg-zinc-950 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-zinc-200">ChatRoom Log</CardTitle>
          <CardDescription className="text-zinc-500">
            {messages.length} messages
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[200px]">
            {messages.map((msg, i) => (
              <div key={i} className="flex gap-2 py-1 text-xs">
                <span className="text-zinc-600 tabular-nums">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </span>
                <span className="text-emerald-400 font-mono">{msg.user}</span>
                <span className="text-zinc-400">{msg.text || `[${msg.type}]`}</span>
              </div>
            ))}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
