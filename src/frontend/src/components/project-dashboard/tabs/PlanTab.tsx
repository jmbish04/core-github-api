import { ProjectAssistant } from "../ProjectAssistant";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

type Task = {
    id: string;
    title: string;
    status: string;
    phaseId?: string | null;
};

type Phase = {
    id: string;
    name: string;
    description: string | null;
    status: string | null;
    startDate?: string | null;
    endDate?: string | null;
};

type PlanTabProps = {
  projectId: string;
  projectName: string;
  phases: Phase[];
  tasks: Task[];
};

export function PlanTab({ projectId, projectName, phases, tasks }: PlanTabProps) {
  // Group tasks by phase
  const groupedTasks = new Map<string, Task[]>();
  for (const task of tasks) {
      const key = task.phaseId || "ungrouped";
      if (!groupedTasks.has(key)) groupedTasks.set(key, []);
      groupedTasks.get(key)?.push(task);
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 h-[calc(100vh-12rem)] min-h-[500px]">
       <ProjectAssistant
        projectId={projectId}
        projectName={projectName}
        title="Project Planner"
        description="Epic → User Stories → Tasks with agent assignment support."
        suggestions={[
            "Outline epics > user stories > tasks",
            "Assign pending work to agents",
            "Review project timeline",
            "Identify blocking issues"
        ]}
        className="h-full"
      />

      <Card className="flex flex-col h-full overflow-hidden">
        <CardHeader>
          <CardTitle>Current Plan</CardTitle>
          <CardDescription>
            Phases and tasks tracked in the system.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 p-0">
            <ScrollArea className="h-full px-6 pb-6">
               <div className="space-y-4">
                {phases.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No phases are currently defined for this project.
                  </p>
                ) : (
                  phases.map((phase) => (
                    <div key={phase.id} className="rounded-md border p-4">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-medium">{phase.name}</h4>
                        <Badge variant="outline">{phase.status || "pending"}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {phase.description || "No phase description provided."}
                      </p>
                      <div className="mt-3 space-y-2">
                        {(groupedTasks.get(phase.id) || []).length === 0 ? (
                          <p className="text-xs text-muted-foreground">No tasks mapped to this phase.</p>
                        ) : (
                          groupedTasks.get(phase.id)?.map((task) => (
                            <div key={task.id} className="flex items-center justify-between rounded border px-3 py-2">
                              <span className="text-sm">{task.title}</span>
                              <Badge variant="secondary">{task.status}</Badge>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ))
                )}

                {(groupedTasks.get("ungrouped") || []).length > 0 && (
                  <div className="rounded-md border p-4">
                    <h4 className="font-medium">Unassigned Tasks</h4>
                    <div className="mt-3 space-y-2">
                      {groupedTasks.get("ungrouped")?.map((task) => (
                        <div key={task.id} className="flex items-center justify-between rounded border px-3 py-2">
                          <span className="text-sm">{task.title}</span>
                          <Badge variant="secondary">{task.status}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

