import { getDb, epics, stories, tasks, workshopProjects, workshopProjectTasks } from "@db";
import type { WorkshopPhase, Task as WorkshopTask } from "@db/schemas/workshop/project_tasks";
import type { PlanningWorkstream } from "@/lib/schemas/jules";
import { PlanningBreakdown } from "../types";
import { enrichDocsQueries } from "../utils";

export async function persistPlanBreakdown(
  env: Env,
  input: {
    requestId: string;
    workstream: PlanningWorkstream;
    markdown: string;
    projectId?: string;
    projectName?: string;
  },
  breakdown: PlanningBreakdown,
): Promise<PlanningBreakdown> {
  const db = getDb(env.DB);
  const docsLookup = await enrichDocsQueries(env, breakdown);
  const targetProjectId = input.projectId || input.requestId;
  const now = new Date();
  const nowStr = now.toISOString();

  const epicRows: Array<typeof epics.$inferInsert> = [];
  const storyRows: Array<typeof stories.$inferInsert> = [];
  const taskRows: Array<typeof tasks.$inferInsert> = [];
  
  breakdown.epics.forEach((epic, epicIndex) => {
    const epicId = `${input.requestId}:epic:${epicIndex + 1}`;
    epicRows.push({
      id: epicId,
      repoId: targetProjectId,
      title: epic.title,
      description: epic.description,
      status: "todo",
      priority: "high",
      createdAt: now,
      updatedAt: now,
    });

    epic.stories.forEach((story, storyIndex) => {
      const storyId = `${input.requestId}:story:${epicIndex + 1}:${storyIndex + 1}`;
      storyRows.push({
        id: storyId,
        repoId: targetProjectId,
        parentId: epicId,
        title: story.title,
        description: story.description,
        status: "todo",
        priority: "medium",
        createdAt: now,
        updatedAt: now,
      });

      story.tasks.forEach((task, taskIndex) => {
        const taskId = `${input.requestId}:task:${epicIndex + 1}:${storyIndex + 1}:${taskIndex + 1}`;
        taskRows.push({
          id: taskId,
          repoId: targetProjectId,
          parentId: storyId,
          title: task.title,
          description: task.description,
          status: "todo",
          priority: "medium",
          assignee: task.assignee,
          kanbanColumn: "backlog",
          createdAt: nowStr,
          updatedAt: nowStr,
        });
      });
    });
  });

  if (epicRows.length > 0) {
    await db.insert(epics).values(epicRows);
  }
  if (storyRows.length > 0) {
    await db.insert(stories).values(storyRows);
  }
  if (taskRows.length > 0) {
    await db.insert(tasks).values(taskRows);
  }

  const workshopProjectId = input.requestId;
  const workshopProjectName = input.projectName || breakdown.title;

  await db
    .insert(workshopProjects)
    .values({
      id: workshopProjectId,
      name: workshopProjectName,
      description: breakdown.summary,
      status: "active",
      draftData: {
        requestId: input.requestId,
        sourceProjectId: input.projectId || null,
        workstream: input.workstream,
      },
      createdAt: nowStr,
      updatedAt: nowStr,
    })
    .onConflictDoUpdate({
      target: workshopProjects.id,
      set: {
        name: workshopProjectName,
        description: breakdown.summary,
        status: "active",
        draftData: {
          requestId: input.requestId,
          sourceProjectId: input.projectId || null,
          workstream: input.workstream,
        },
        updatedAt: nowStr,
      },
    });

  const phases: WorkshopPhase[] = breakdown.epics.map((epic, epicIndex) => {
    const tasks: WorkshopTask[] = epic.stories.flatMap((story, storyIndex) =>
      story.tasks.map((task, taskIndex) => ({
        task_number: storyIndex * 100 + taskIndex + 1,
        status: "not_started",
        agent_assigned: task.assignee,
        task_title: task.title,
        task_description: task.description,
        task_dependencies: [],
        cloudflare_docs_queries: task.docsQueries,
        steps: [],
        requirements: [
          ...task.requirements,
          ...task.docsQueries.map((query) => `Docs insight: ${docsLookup.get(query) || ""}`),
        ].filter(Boolean),
        success_criteria: task.successCriteria,
      })),
    );

    return {
      phase_number: epicIndex + 1,
      phase_title: epic.title,
      description: epic.description,
      success_criteria: epic.stories.flatMap((story) =>
        story.tasks.flatMap((task) => task.successCriteria),
      ),
      implementation_plan: {
        title: epic.title,
        description: epic.description,
        architecture: {
          explanation: breakdown.summary,
          mermaid_diagram: [
            "flowchart TD",
            `A[${workshopProjectName}] --> B[${epic.title}]`,
            `B --> C[Stories: ${epic.stories.length}]`,
            `C --> D[Tasks: ${tasks.length}]`,
          ].join("\n"),
        },
        proposed_changes: [],
        verification_plan: {
          automated_tests: [],
          manual_verification: epic.stories.flatMap((story) =>
            story.tasks.flatMap((task) => task.successCriteria),
          ),
        },
      },
      tasks,
    };
  });

  await db
    .insert(workshopProjectTasks)
    .values({
      id: input.requestId,
      projectId: workshopProjectId,
      projectName: workshopProjectName,
      generatedDate: nowStr,
      totalPhases: phases.length,
      phases,
      createdAt: nowStr,
      updatedAt: nowStr,
    })
    .onConflictDoUpdate({
      target: workshopProjectTasks.id,
      set: {
        projectName: workshopProjectName,
        generatedDate: nowStr,
        totalPhases: phases.length,
        phases,
        updatedAt: nowStr,
      },
    });

  return breakdown;
}
