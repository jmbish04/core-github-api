import { MetricCard } from "@/components/jules/MetricCard";
import { SprintSummaryCard } from "@/components/jules/SprintSummaryCard";
import { VelocityChart } from "@/components/jules/VelocityChart";
import { CheckCircle2, Clock, Activity, ListTodo } from "lucide-react";

const DUMMY_VELOCITY_DATA = [
  { sprint: "Sprint 1", tasks: 24 },
  { sprint: "Sprint 2", tasks: 30 },
  { sprint: "Sprint 3", tasks: 28 },
  { sprint: "Sprint 4", tasks: 35 },
  { sprint: "Sprint 5", tasks: 32 },
  { sprint: "Sprint 6", tasks: 40 },
  { sprint: "Sprint 7", tasks: 38 },
  { sprint: "Sprint 8", tasks: 42 },
];

const DUMMY_BURNDOWN_DATA = [
  { day: "Day 1", remaining: 42, ideal: 42 },
  { day: "Day 2", remaining: 40, ideal: 38 },
  { day: "Day 3", remaining: 35, ideal: 34 },
  { day: "Day 4", remaining: 32, ideal: 30 },
  { day: "Day 5", remaining: 28, ideal: 26 },
  { day: "Day 6", remaining: 25, ideal: 22 },
  { day: "Day 7", remaining: 18, ideal: 18 },
  { day: "Day 8", remaining: 15, ideal: 14 },
  { day: "Day 9", remaining: 10, ideal: 10 },
  { day: "Day 10", remaining: 5, ideal: 5 },
  { day: "Day 11", remaining: 2, ideal: 1 },
];

export function VelocityPage() {
  return (
    <div className="flex-1 space-y-6 p-6 sm:p-8 bg-zinc-950 min-h-screen text-zinc-100">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Jules Velocity</h2>
        <p className="text-zinc-400 mt-2">
          Track sprint progress, team velocity, and task completion metrics.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Tasks"
          value={342}
          icon={ListTodo}
          description="Tasks created across all projects"
        />
        <MetricCard
          title="Completed This Sprint"
          value={28}
          icon={CheckCircle2}
          description="Out of 42 planned tasks"
        />
        <MetricCard
          title="Velocity Avg (Last 8 Sprints)"
          value={34}
          icon={Activity}
          description="Tasks per sprint"
        />
        <MetricCard
          title="Avg Cycle Time"
          value="4.2d"
          icon={Clock}
          description="From in-progress to done"
        />
      </div>

      <div className="grid gap-6 grid-cols-1 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <VelocityChart
            velocityData={DUMMY_VELOCITY_DATA}
            burndownData={DUMMY_BURNDOWN_DATA}
          />
        </div>
        <div className="xl:col-span-1">
          <SprintSummaryCard
            sprintName="Sprint 9 - Frontend Revamp"
            startDate="Oct 10, 2026"
            endDate="Oct 24, 2026"
            progress={66}
            tasksCompleted={28}
            tasksTotal={42}
            tasksInProgress={8}
            tasksTodo={6}
          />
        </div>
      </div>
    </div>
  );
}
