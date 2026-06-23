import { useMemo } from "react";
import { MetricCard } from "@/components/jules/MetricCard";
import { SprintSummaryCard } from "@/components/jules/SprintSummaryCard";
import { VelocityChart } from "@/components/jules/VelocityChart";
import { CheckCircle2, Clock, Activity, ListTodo, Loader2 } from "lucide-react";
import { useBacklogItems } from "@/hooks/jules/useBacklogItems";
import { useAgentInsights } from "@/hooks/jules/useAgentInsights";
import type { BacklogTask } from "@/hooks/jules/useBacklogItems";

/** Flatten a tree of tasks into a single array */
function flattenTasks(tasks: BacklogTask[]): BacklogTask[] {
  const result: BacklogTask[] = [];
  for (const t of tasks) {
    result.push(t);
    if (t.children?.length) result.push(...flattenTasks(t.children));
  }
  return result;
}

export function VelocityPage() {
  const { items, isLoading: tasksLoading } = useBacklogItems();
  const { sessions, isLoading: insightsLoading } = useAgentInsights();
  const isLoading = tasksLoading || insightsLoading;

  const allTasks = useMemo(() => flattenTasks(items), [items]);
  const totalTasks = allTasks.length;
  const doneTasks = allTasks.filter((t) => t.status === "done").length;
  const inProgressTasks = allTasks.filter((t) => t.status === "in_progress").length;
  const todoTasks = allTasks.filter((t) => t.status === "todo" || t.status === "backlog").length;
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  // Derive velocity data from completed sessions grouped into weekly buckets
  const velocityData = useMemo(() => {
    if (sessions.length === 0) return [];
    const buckets: Record<string, number> = {};
    for (const s of sessions) {
      if (s.status !== "success") continue;
      // Group by week number
      const weekNum = Math.ceil(sessions.indexOf(s) / 5) || 1;
      const key = `Sprint ${weekNum}`;
      buckets[key] = (buckets[key] || 0) + 1;
    }
    return Object.entries(buckets).map(([sprint, tasks]) => ({ sprint, tasks }));
  }, [sessions]);

  // Derive burndown from task completion timeline
  const burndownData = useMemo(() => {
    if (totalTasks === 0) return [];
    const remaining = totalTasks - doneTasks;
    const days = Math.max(remaining, 5);
    const idealPerDay = totalTasks / days;
    return Array.from({ length: days }, (_, i) => ({
      day: `Day ${i + 1}`,
      remaining: Math.max(0, remaining - Math.floor(i * (remaining / days))),
      ideal: Math.max(0, Math.round(totalTasks - idealPerDay * (i + 1))),
    }));
  }, [totalTasks, doneTasks]);

  // Compute avg cycle time (from session durations)
  const avgCycleTime = useMemo(() => {
    const completedDurations = sessions
      .filter((s) => s.status === "success")
      .map((s) => {
        const match = s.duration.match(/(\d+)m/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((d) => d > 0);
    if (completedDurations.length === 0) return "N/A";
    const avg = completedDurations.reduce((a, b) => a + b, 0) / completedDurations.length;
    return `${avg.toFixed(1)}m`;
  }, [sessions]);

  return (
    <div className="flex-1 space-y-6 p-6 sm:p-8 bg-zinc-950 min-h-screen text-zinc-100">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Jules Velocity</h2>
        <p className="text-zinc-400 mt-2">
          Track sprint progress, team velocity, and task completion metrics.
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12 text-zinc-500 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading velocity data...
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Tasks"
          value={totalTasks}
          icon={ListTodo}
          description="Tasks created across all projects"
        />
        <MetricCard
          title="Completed"
          value={doneTasks}
          icon={CheckCircle2}
          description={`Out of ${totalTasks} total tasks`}
        />
        <MetricCard
          title="Velocity Avg"
          value={velocityData.length > 0 ? Math.round(velocityData.reduce((a, v) => a + v.tasks, 0) / velocityData.length) : 0}
          icon={Activity}
          description="Completed sessions per sprint"
        />
        <MetricCard
          title="Avg Cycle Time"
          value={avgCycleTime}
          icon={Clock}
          description="Average session duration"
        />
      </div>

      <div className="grid gap-6 grid-cols-1 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <VelocityChart
            velocityData={velocityData}
            burndownData={burndownData}
          />
        </div>
        <div className="xl:col-span-1">
          <SprintSummaryCard
            sprintName="Current Sprint"
            startDate={new Date(Date.now() - 7 * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            endDate={new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            progress={progress}
            tasksCompleted={doneTasks}
            tasksTotal={totalTasks}
            tasksInProgress={inProgressTasks}
            tasksTodo={todoTasks}
          />
        </div>
      </div>
    </div>
  );
}
