/**
 * @file views/repos/Dashboard.tsx
 * Repo-scoped Dashboard — the landing page for /repos/:owner/:repo/dashboard.
 *
 * Translated from Stitch HTML wireframes (Desktop 1440px + Mobile 375px)
 * into production React + shadcn/ui following the "Brutalist Sanctuary" design system.
 *
 * Data source: useOutletContext() from RepoLayout.
 * Environment: Cloudflare Worker Assets (no Node.js APIs).
 */

import { useOutletContext, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Wand2,
  Sparkles,
  Bot,
  Eye,
  Shield,
  GitPullRequest,
  Activity,
  Rocket,
  TrendingUp,
  AlertCircle,
  User,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Status color constants (matching Stitch wireframe) ─────────────────────

const STATUS_COLORS: Record<string, string> = {
  backlog: "bg-zinc-500",
  todo: "bg-blue-500",
  in_progress: "bg-amber-500",
  review: "bg-violet-500",
  done: "bg-emerald-500",
};

const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
};

// ── Helper: relative time ──────────────────────────────────────────────────

function relativeTime(dateStr: string, nowMs: number = Date.now()): string {
  const then = new Date(dateStr).getTime();
  if (!Number.isFinite(then)) return "Unknown";
  const diffMs = nowMs - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function RepoDashboardPage() {
  const navigate = useNavigate();
  const {
    repoOwner,
    repoName,
    basePath,
    overview,
    taskQueryData,
    setSelectedEvent,
  } = useOutletContext<any>();

  // ── Derived data ─────────────────────────────────────────────────────────

  const [now] = useState(() => Date.now());

  const tasks = useMemo(() => taskQueryData?.tasks || [], [taskQueryData?.tasks]);
  const pendingPrs = useMemo(() => overview?.pendingPrs || [], [overview?.pendingPrs]);
  const recentActivity = useMemo(() => overview?.recentActivity || [], [overview?.recentActivity]);

  /** Group tasks by kanbanColumn/status for the breakdown bar. */
  const taskCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    let total = 0;
    for (const t of tasks) {
      const s = t.kanbanColumn || t.status || "backlog";
      counts[s] = (counts[s] || 0) + 1;
      total++;
    }
    return { counts, total };
  }, [tasks]);

  /** Count of non-done tasks → "Open Issues" stat. */
  const openIssueCount = useMemo(() => {
    return tasks.filter(
      (t: any) => (t.kanbanColumn || t.status) !== "done"
    ).length;
  }, [tasks]);

  /** Deploy status: "Live" if lastDeployedAt within 24h, "Stale" otherwise. */
  const deployStatus = useMemo(() => {
    const lastDeploy = overview?.project?.lastDeployedAt;
    if (!lastDeploy) return { label: "Unknown", isLive: false, time: "Never" };
    const deployTime = new Date(lastDeploy).getTime();
    const hoursAgo = (now - deployTime) / (1000 * 60 * 60);
    return {
      label: hoursAgo <= 24 ? "Live" : "Stale",
      isLive: hoursAgo <= 24,
      time: relativeTime(lastDeploy, now),
    };
  }, [overview?.project?.lastDeployedAt, now]);

  // ── Quick Actions config ─────────────────────────────────────────────────

  const quickActions = [
    { label: "Auto-Fix Repo", icon: Wand2, path: `${basePath}/tools` },
    { label: "Generate Summary", icon: Sparkles, path: `${basePath}/plan` },
    { label: "Dispatch to Jules", icon: Bot, path: `${basePath}/workshop` },
    { label: "View Explorer", icon: Eye, path: `${basePath}/explorer` },
    {
      label: "Run Standardization",
      icon: Shield,
      path: `${basePath}/tools/standardization`,
    },
  ];

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* ── ROW 1: Stat Strip ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Health Score */}
        <Card className="bg-zinc-900/50 border-zinc-800/20 group hover:border-emerald-500/30 transition-all">
          <CardContent className="p-5">
            <div className="flex justify-between items-start mb-3">
              <span className="text-sm font-medium text-zinc-400">
                Repo Health
              </span>
              <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tighter text-zinc-100">
                94%
              </span>
              <span className="text-[10px] text-emerald-400 font-semibold tracking-wider">
                EXCELLENT
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Open Issues */}
        <Card className="bg-zinc-900/50 border-zinc-800/20 hover:border-zinc-700 transition-all">
          <CardContent className="p-5">
            <div className="flex justify-between items-start mb-3">
              <span className="text-sm font-medium text-zinc-400">
                Open Issues
              </span>
              {openIssueCount > 10 && (
                <TrendingUp className="w-4 h-4 text-rose-400" />
              )}
              {openIssueCount <= 10 && (
                <AlertCircle className="w-4 h-4 text-zinc-500" />
              )}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tighter text-zinc-100">
                {openIssueCount}
              </span>
              {openIssueCount > 10 && (
                <span className="text-[10px] text-rose-400 font-semibold">
                  needs attention
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* PRs Merged */}
        <Card className="bg-zinc-900/50 border-zinc-800/20 hover:border-zinc-700 transition-all">
          <CardContent className="p-5">
            <div className="flex justify-between items-start mb-3">
              <span className="text-sm font-medium text-zinc-400">
                Pending PRs
              </span>
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tighter text-zinc-100">
                {pendingPrs.length}
              </span>
              <span className="text-[10px] text-emerald-400 font-semibold">
                awaiting review
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Deploy Status */}
        <Card className="bg-zinc-900/50 border-zinc-800/20 hover:border-zinc-700 transition-all">
          <CardContent className="p-5">
            <div className="flex justify-between items-start mb-3">
              <span className="text-sm font-medium text-zinc-400">
                Deploy Status
              </span>
              <span
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-bold tracking-tight",
                  deployStatus.isLive
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-amber-500/10 text-amber-400"
                )}
              >
                {deployStatus.label.toUpperCase()}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold tracking-tighter text-zinc-100">
                {overview?.project?.name || `${repoOwner}/${repoName}`}
              </span>
              <span className="text-[10px] text-zinc-500">
                {deployStatus.time}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── ROW 2: Main Content Grid ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── COLUMN 1: Quick Actions ──────────────────────────────────── */}
        <div className="flex flex-col gap-6">
          <Card className="bg-zinc-900/50 border-zinc-800/20 flex flex-col h-full">
            <CardHeader className="py-3 px-4 border-b border-zinc-800/50 flex-row items-center gap-2 space-y-0">
              <Rocket className="w-4 h-4 text-emerald-400" />
              <CardTitle className="text-sm font-medium text-zinc-100">
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex flex-col gap-2">
              {quickActions.map((action) => (
                <Button
                  key={action.label}
                  variant="ghost"
                  className="w-full justify-start gap-3 text-zinc-300 hover:bg-zinc-800/50 h-11 border border-zinc-800/40 hover:border-zinc-700"
                  onClick={() => navigate(action.path)}
                >
                  <action.icon className="w-4 h-4 shrink-0" />
                  {action.label}
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* ── COLUMN 2: Activity Feed ──────────────────────────────────── */}
        <div className="flex flex-col gap-6">
          <Card className="bg-zinc-900/50 border-zinc-800/20 flex flex-col max-h-[600px]">
            <CardHeader className="py-3 px-4 border-b border-zinc-800/50 flex-row items-center gap-2 space-y-0 sticky top-0 bg-zinc-900/90 backdrop-blur-sm z-10">
              <Activity className="w-4 h-4 text-indigo-400" />
              <CardTitle className="text-sm font-medium text-zinc-100">
                Activity Feed
              </CardTitle>
            </CardHeader>
            <ScrollArea className="flex-1">
              <div className="divide-y divide-zinc-800/30">
                {recentActivity.length === 0 && (
                  <div className="p-6 text-center text-xs text-zinc-500">
                    No recent activity.
                  </div>
                )}
                {recentActivity.map((event: any) => {
                  const isSystem = event.actor === "system";
                  const Icon = isSystem ? Bot : User;
                  return (
                    <div
                      key={event.id}
                      className="px-4 py-4 flex gap-3 hover:bg-zinc-800/20 transition-colors cursor-pointer"
                      onClick={() => setSelectedEvent?.(event)}
                    >
                      <div
                        className={cn(
                          "w-8 h-8 rounded flex items-center justify-center shrink-0",
                          isSystem
                            ? "bg-indigo-500/20"
                            : "bg-zinc-800"
                        )}
                      >
                        <Icon
                          className={cn(
                            "w-4 h-4",
                            isSystem
                              ? "text-indigo-400"
                              : "text-zinc-400"
                          )}
                        />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <p className="text-sm font-medium text-zinc-200 truncate">
                          {event.projectName || "Update"}
                        </p>
                        <p className="text-xs text-zinc-400 truncate">
                          {event.type || "Action"}:{" "}
                          {event.content?.action || "Update"}
                        </p>
                        <span className="text-[10px] text-zinc-500 mt-1">
                          {relativeTime(event.createdAt)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </Card>
        </div>

        {/* ── COLUMN 3: Pending PRs + Task Breakdown ───────────────────── */}
        <div className="flex flex-col gap-6">
          {/* Pending PRs */}
          <Card className="bg-zinc-900/50 border-zinc-800/20 flex flex-col">
            <CardHeader className="py-3 px-4 border-b border-zinc-800/50 flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-2">
                <GitPullRequest className="w-4 h-4 text-indigo-400" />
                <CardTitle className="text-sm font-medium text-zinc-100">
                  Pending PRs
                </CardTitle>
              </div>
              <Badge
                variant="secondary"
                className="bg-indigo-500/20 text-indigo-400 text-[10px] font-bold"
              >
                {pendingPrs.length}
              </Badge>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {pendingPrs.length === 0 && (
                <p className="text-xs text-zinc-500 text-center py-4">
                  No pending PRs. 🎉
                </p>
              )}
              {pendingPrs.slice(0, 5).map((pr: any) => (
                <div
                  key={pr.number}
                  className="flex items-center justify-between group"
                >
                  <div className="flex flex-col min-w-0 flex-1 mr-3">
                    <span className="text-[10px] font-bold text-indigo-400 tracking-tighter">
                      #{pr.number}
                    </span>
                    <p className="text-xs font-medium text-zinc-200 truncate">
                      {pr.title}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 text-[10px] font-bold text-zinc-400 hover:text-zinc-100 border-zinc-800 hover:bg-zinc-800 h-7 px-3"
                    onClick={() => {
                      if (pr.url) {
                        window.open(pr.url, "_blank");
                      }
                    }}
                  >
                    Review
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Task Breakdown */}
          <Card className="bg-zinc-900/50 border-zinc-800/20 flex flex-col">
            <CardHeader className="py-3 px-4 border-b border-zinc-800/50 flex-row items-center gap-2 space-y-0">
              <BarChart3 className="w-4 h-4 text-zinc-400" />
              <CardTitle className="text-sm font-medium text-zinc-100">
                Task Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              {/* Segmented progress bar */}
              <div className="w-full h-3 rounded flex overflow-hidden mb-6 bg-zinc-800">
                {Object.entries(STATUS_COLORS).map(([status, colorClass]) => {
                  const count = taskCounts.counts[status] || 0;
                  const pct =
                    taskCounts.total > 0
                      ? (count / taskCounts.total) * 100
                      : 0;
                  if (pct === 0) return null;
                  return (
                    <div
                      key={status}
                      className={cn("h-full", colorClass)}
                      style={{ width: `${pct}%` }}
                    />
                  );
                })}
              </div>

              {/* Legend */}
              <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                {Object.entries(STATUS_COLORS).map(([status, colorClass]) => {
                  const count = taskCounts.counts[status] || 0;
                  return (
                    <div key={status} className="flex items-center gap-2">
                      <span
                        className={cn("h-2 w-2 rounded-full", colorClass)}
                      />
                      <span className="text-[10px] text-zinc-400 font-medium">
                        {STATUS_LABELS[status] || status}
                      </span>
                      <span className="text-[10px] text-zinc-100 ml-auto font-bold">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
