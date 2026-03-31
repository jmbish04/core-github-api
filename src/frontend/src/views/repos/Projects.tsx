/**
 * @file views/repos/Projects.tsx
 * Repo-scoped Projects thin wrapper.
 *
 * Fetches repo-specific task data from useOutletContext and renders
 * the shared ProjectCardGrid component scoped to this repository.
 */

import { useOutletContext, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Plus, Search, FolderGit2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Status display config ──────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; dotClass: string; badgeVariant: "default" | "secondary" | "destructive" | "outline" }> = {
  backlog: { label: "Backlog", dotClass: "bg-zinc-500", badgeVariant: "outline" },
  todo: { label: "To Do", dotClass: "bg-blue-500", badgeVariant: "secondary" },
  in_progress: { label: "In Progress", dotClass: "bg-amber-500", badgeVariant: "default" },
  review: { label: "In Review", dotClass: "bg-violet-500", badgeVariant: "secondary" },
  done: { label: "Done", dotClass: "bg-emerald-500", badgeVariant: "outline" },
};

export default function RepoProjectsPage() {
  const navigate = useNavigate();
  const {
    repoOwner,
    repoName,
    basePath,
    projectDetails,
    taskQueryData,
  } = useOutletContext<any>();

  const [searchQuery, setSearchQuery] = useState("");

  const tasks = useMemo(() => taskQueryData?.tasks || [], [taskQueryData?.tasks]);
  const phases = useMemo(() => projectDetails?.phases || [], [projectDetails?.phases]);

  /** Filter tasks by search query. */
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return tasks;
    const q = searchQuery.toLowerCase();
    return tasks.filter(
      (t: any) =>
        t.title?.toLowerCase().includes(q) ||
        t.assignee?.toLowerCase().includes(q)
    );
  }, [tasks, searchQuery]);

  /** Group tasks by phase. */
  const tasksByPhase = useMemo(() => {
    const groups: Record<string, any[]> = { unassigned: [] };
    for (const phase of phases) {
      groups[phase.id] = [];
    }
    for (const task of filteredTasks) {
      const phaseId = task.phaseId || "unassigned";
      if (!groups[phaseId]) groups[phaseId] = [];
      groups[phaseId].push(task);
    }
    return groups;
  }, [filteredTasks, phases]);

  /** Task status counts for summary. */
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tasks) {
      const s = t.kanbanColumn || t.status || "backlog";
      counts[s] = (counts[s] || 0) + 1;
    }
    return counts;
  }, [tasks]);

  return (
    <div className="space-y-6">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <FolderGit2 className="w-5 h-5 text-blue-400" />
            Work Items
          </h2>
          <p className="text-sm text-zinc-400">
            Tasks and issues for{" "}
            <span className="text-zinc-200 font-medium">
              {repoOwner}/{repoName}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`${basePath}/projects/kanban`)}
          >
            Kanban Board
          </Button>
          <Button size="sm" className="gap-1">
            <Plus className="w-4 h-4" /> New Task
          </Button>
        </div>
      </div>

      {/* ── Status Summary Strip ──────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(STATUS_CONFIG).map(([status, config]) => {
          const count = statusCounts[status] || 0;
          return (
            <Badge
              key={status}
              variant={config.badgeVariant}
              className="gap-1.5 text-xs"
            >
              <span className={cn("h-2 w-2 rounded-full", config.dotClass)} />
              {config.label}: {count}
            </Badge>
          );
        })}
        <Badge variant="outline" className="text-xs text-zinc-400">
          Total: {tasks.length}
        </Badge>
      </div>

      {/* ── Search ────────────────────────────────────────────────────── */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search tasks..."
          className="pl-9"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* ── Task List grouped by Phase ────────────────────────────────── */}
      {phases.length > 0 ? (
        phases.map((phase: any) => {
          const phaseTasks = tasksByPhase[phase.id] || [];
          return (
            <Card
              key={phase.id}
              className="bg-zinc-900/50 border-zinc-800/20"
            >
              <CardHeader className="py-3 px-4 border-b border-zinc-800/50 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-zinc-100">
                  {phase.name}
                </CardTitle>
                <Badge variant="secondary" className="text-[10px]">
                  {phaseTasks.length} tasks
                </Badge>
              </CardHeader>
              <CardContent className="p-0">
                {phaseTasks.length === 0 ? (
                  <p className="p-4 text-xs text-zinc-500">
                    No tasks in this phase.
                  </p>
                ) : (
                  <div className="divide-y divide-zinc-800/30">
                    {phaseTasks.map((task: any) => {
                      const statusKey =
                        task.kanbanColumn || task.status || "backlog";
                      const config = STATUS_CONFIG[statusKey] || STATUS_CONFIG.backlog;
                      return (
                        <div
                          key={task.id}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/20 transition-colors cursor-pointer"
                        >
                          <span
                            className={cn(
                              "h-2.5 w-2.5 rounded-full shrink-0",
                              config.dotClass
                            )}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-zinc-200 truncate">
                              {task.title}
                            </p>
                          </div>
                          {task.priority && (
                            <Badge
                              variant={
                                task.priority === "critical"
                                  ? "destructive"
                                  : task.priority === "high"
                                    ? "default"
                                    : "secondary"
                              }
                              className="text-[10px] shrink-0"
                            >
                              {task.priority}
                            </Badge>
                          )}
                          {task.assignee && (
                            <span className="text-[10px] text-zinc-500 shrink-0">
                              @{task.assignee}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      ) : (
        /* Flat list when no phases exist */
        <Card className="bg-zinc-900/50 border-zinc-800/20">
          <CardHeader className="py-3 px-4 border-b border-zinc-800/50">
            <CardTitle className="text-sm font-medium text-zinc-100">
              All Tasks
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {filteredTasks.length === 0 ? (
              <div className="p-8 text-center text-zinc-500">
                <FolderGit2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No tasks found.</p>
                <Button variant="link" size="sm" className="mt-1">
                  Create your first task
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/30">
                {filteredTasks.map((task: any) => {
                  const statusKey =
                    task.kanbanColumn || task.status || "backlog";
                  const config = STATUS_CONFIG[statusKey] || STATUS_CONFIG.backlog;
                  return (
                    <div
                      key={task.id}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/20 transition-colors cursor-pointer"
                    >
                      <span
                        className={cn(
                          "h-2.5 w-2.5 rounded-full shrink-0",
                          config.dotClass
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-zinc-200 truncate">
                          {task.title}
                        </p>
                      </div>
                      {task.priority && (
                        <Badge
                          variant={
                            task.priority === "critical"
                              ? "destructive"
                              : task.priority === "high"
                                ? "default"
                                : "secondary"
                          }
                          className="text-[10px] shrink-0"
                        >
                          {task.priority}
                        </Badge>
                      )}
                      {task.assignee && (
                        <span className="text-[10px] text-zinc-500 shrink-0">
                          @{task.assignee}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
