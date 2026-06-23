import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface SprintSummaryCardProps {
  sprintName: string;
  startDate: string;
  endDate: string;
  progress: number;
  tasksCompleted: number;
  tasksTotal: number;
  tasksInProgress: number;
  tasksTodo: number;
}

export function SprintSummaryCard({
  sprintName,
  startDate,
  endDate,
  progress,
  tasksCompleted,
  tasksTotal,
  tasksInProgress,
  tasksTodo,
}: SprintSummaryCardProps) {
  return (
    <Card className="border-0 bg-zinc-900/50 shadow-none">
      <CardHeader>
        <CardTitle className="text-lg font-medium text-zinc-100">
          {sprintName}
        </CardTitle>
        <p className="text-sm text-zinc-500">
          {startDate} - {endDate}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-400">Sprint Progress</span>
            <span className="font-medium text-zinc-200">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2 bg-zinc-800" indicatorClassName="bg-zinc-400" />
        </div>

        <div className="grid grid-cols-3 gap-4 border-t border-zinc-800/50 pt-4">
          <div>
            <p className="text-sm font-medium text-zinc-500 mb-1">Done</p>
            <p className="text-2xl font-semibold text-zinc-200">
              {tasksCompleted}
              <span className="text-sm font-normal text-zinc-500 ml-1">
                / {tasksTotal}
              </span>
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-500 mb-1">In Progress</p>
            <p className="text-2xl font-semibold text-zinc-200">{tasksInProgress}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-500 mb-1">To Do</p>
            <p className="text-2xl font-semibold text-zinc-200">{tasksTodo}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
