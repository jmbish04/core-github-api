import { generateStructuredResponse } from "@/ai/providers";
import { queryMCP } from "@/ai/mcp/mcp-client";
import { getDb, projectPlans, workshopProjects, workshopProjectTasks } from "@db";
import type { Phase, Task as WorkshopTask } from "@db/schemas/workshop/project_tasks";
import type { PlanningRequestInput, PlanningWorkstream } from "@/lib/schemas/jules";
import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";

export interface CapturedPlanStep {
  id?: string;
  index?: number;
  title: string;
  description?: string;
}

export interface CapturedAgentMessage {
  id: string;
  createTime: string;
  message: string;
}

export interface CapturedProgressUpdate {
  id: string;
  createTime: string;
  title: string;
  description: string;
}

export interface CapturedDiffSummaryFile {
  path: string;
  changeType?: string;
  additions?: number;
  deletions?: number;
}

export interface CapturedDiffSummary {
  activityId: string;
  createTime: string;
  files: CapturedDiffSummaryFile[];
}

export interface PlanningCaptureState {
  seenActivityIds: string[];
  planSteps: CapturedPlanStep[];
  agentMessages: CapturedAgentMessage[];
  progressUpdates: CapturedProgressUpdate[];
  diffSummaries: CapturedDiffSummary[];
  completedAt?: string;
  failedReason?: string;
}

export interface PlanningSessionResultSummary {
  state?: string;
  error?: unknown;
  rawResult?: unknown;
  outputs?: {
    pullRequests: Array<{ title: string; number: number; url: string }>;
    changeSets: Array<{ filename: string; content: string }>;
    generatedFiles: Array<{ path: string; content: string }>;
  };
}

const PlanningTaskSchema = z.object({
  title: z.string(),
  description: z.string(),
  requirements: z.array(z.string()).default([]),
  successCriteria: z.array(z.string()).default([]),
  docsQueries: z.array(z.string()).default([]),
  assignee: z.string().optional(),
});

const PlanningStorySchema = z.object({
  title: z.string(),
  description: z.string(),
  docsQueries: z.array(z.string()).default([]),
  tasks: z.array(PlanningTaskSchema).default([]),
});

const PlanningEpicSchema = z.object({
  title: z.string(),
  description: z.string(),
  docsQueries: z.array(z.string()).default([]),
  stories: z.array(PlanningStorySchema).default([]),
});

const PlanningBreakdownSchema = z.object({
  title: z.string(),
  summary: z.string(),
  epics: z.array(PlanningEpicSchema).default([]),
});

type PlanningBreakdown = z.infer<typeof PlanningBreakdownSchema>;

function excerpt(value: unknown, maxLength = 420): string {
  const text =
    typeof value === "string"
      ? value
      : value == null
        ? ""
        : JSON.stringify(value);

  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;
}

function toArray<T>(value: Iterable<T> | ArrayLike<T> | undefined | null): T[] {
  return value ? Array.from(value) : [];
}

export function createEmptyPlanningCapture(): PlanningCaptureState {
  return {
    seenActivityIds: [],
    planSteps: [],
    agentMessages: [],
    progressUpdates: [],
    diffSummaries: [],
  };
}

export function extractFilesFromDiff(unidiff: string): Map<string, string> {
  const files = new Map<string, string>();
  const fileBlocks = unidiff.split(/(?=^diff --git)/m).filter(Boolean);

  for (const block of fileBlocks) {
    const pathMatch = block.match(/^\+\+\+ b\/(.+)$/m);
    if (!pathMatch) {
      continue;
    }

    const filePath = pathMatch[1];
    const lines = block.split("\n");
    const contentLines: string[] = [];

    for (const line of lines) {
      if (
        line.startsWith("+++") ||
        line.startsWith("---") ||
        line.startsWith("@@") ||
        line.startsWith("diff --git") ||
        line.startsWith("index ") ||
        line.startsWith("new file")
      ) {
        continue;
      }
      if (line.startsWith("+")) {
        contentLines.push(line.slice(1));
      }
    }

    if (contentLines.length > 0) {
      files.set(filePath, contentLines.join("\n"));
    }
  }

  return files;
}

function recordSeen(state: PlanningCaptureState, activityId: string): boolean {
  if (state.seenActivityIds.includes(activityId)) {
    return false;
  }

  state.seenActivityIds.push(activityId);
  return true;
}

export function applyJulesActivityToPlanningCapture(
  state: PlanningCaptureState,
  activity: any,
): PlanningCaptureState {
  if (!activity?.id || !recordSeen(state, activity.id)) {
    return state;
  }

  switch (activity.type) {
    case "planGenerated":
      state.planSteps = toArray(activity.plan?.steps).map((step: any) => ({
        id: step.id,
        index: step.index,
        title: step.title,
        description: step.description,
      }));
      break;
    case "agentMessaged":
      state.agentMessages.push({
        id: activity.id,
        createTime: activity.createTime,
        message: activity.message,
      });
      break;
    case "progressUpdated": {
      state.progressUpdates.push({
        id: activity.id,
        createTime: activity.createTime,
        title: activity.title,
        description: activity.description,
      });

      const files = toArray(activity.artifacts)
        .filter((artifact: any) => artifact?.type === "changeSet")
        .flatMap((artifact: any) => {
          const parsed = typeof artifact.parsed === "function" ? artifact.parsed() : null;
          return toArray(parsed?.files).map((file: any) => ({
            path: file.path,
            changeType: file.changeType,
            additions: file.additions,
            deletions: file.deletions,
          }));
        });

      if (files.length > 0) {
        state.diffSummaries.push({
          activityId: activity.id,
          createTime: activity.createTime,
          files,
        });
      }
      break;
    }
    case "sessionCompleted":
      state.completedAt = activity.createTime;
      break;
    case "sessionFailed":
      state.failedReason = activity.reason || "Jules session failed";
      break;
    default:
      break;
  }

  return state;
}

export function buildPlanningMarkdown(options: {
  requestId: string;
  workstream: PlanningWorkstream;
  prompt: string;
  githubRepo?: string;
  baseBranch?: string;
  capture: PlanningCaptureState;
  result?: PlanningSessionResultSummary | null;
  failureMessage?: string | null;
}): string {
  const sections: string[] = [];
  const result = options.result;

  sections.push(`# Planning Request ${options.requestId}`);
  sections.push(
    [
      `- Workstream: ${options.workstream}`,
      options.githubRepo ? `- Repository: ${options.githubRepo}` : null,
      options.baseBranch ? `- Base branch: ${options.baseBranch}` : null,
      result?.state ? `- Final Jules state: ${result.state}` : null,
      options.failureMessage ? `- Failure: ${options.failureMessage}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  sections.push("## Prompt");
  sections.push(options.prompt);

  if (options.capture.planSteps.length > 0) {
    sections.push("## Generated Plan");
    sections.push(
      options.capture.planSteps
        .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
        .map((step, index) => {
          const title = `${index + 1}. ${step.title}`;
          return step.description ? `${title}\n   - ${step.description}` : title;
        })
        .join("\n"),
    );
  }

  if (options.capture.agentMessages.length > 0) {
    sections.push("## Agent Messages");
    sections.push(
      options.capture.agentMessages
        .map((message) => `- ${message.createTime}: ${message.message}`)
        .join("\n"),
    );
  }

  if (options.capture.progressUpdates.length > 0) {
    sections.push("## Progress Updates");
    sections.push(
      options.capture.progressUpdates
        .map((update) => `- ${update.createTime}: ${update.title} — ${update.description}`)
        .join("\n"),
    );
  }

  if (options.capture.diffSummaries.length > 0) {
    sections.push("## Diff Summary");
    sections.push(
      options.capture.diffSummaries
        .map((summary) => {
          const files = summary.files
            .map((file) => `  - ${file.changeType || "modified"} ${file.path} (+${file.additions || 0}/-${file.deletions || 0})`)
            .join("\n");
          return `- ${summary.createTime}\n${files}`;
        })
        .join("\n"),
    );
  }

  if (result?.outputs?.pullRequests?.length) {
    sections.push("## Pull Requests");
    sections.push(
      result.outputs.pullRequests
        .map((pullRequest) => `- [#${pullRequest.number || "?"} ${pullRequest.title}](${pullRequest.url})`)
        .join("\n"),
    );
  }

  if (result?.outputs?.generatedFiles?.length) {
    sections.push("## Generated Files");
    sections.push(
      result.outputs.generatedFiles
        .map((file) => `- ${file.path}`)
        .join("\n"),
    );
  }

  if (result?.outputs?.changeSets?.length) {
    sections.push("## Change Set Files");
    sections.push(
      result.outputs.changeSets
        .map((file) => `- ${file.filename}`)
        .join("\n"),
    );
  }

  return sections.join("\n\n").trim();
}

async function enrichDocsQueries(
  env: Env,
  breakdown: PlanningBreakdown,
): Promise<Map<string, string>> {
  const querySet = new Set<string>();

  for (const epic of breakdown.epics) {
    epic.docsQueries.forEach((query) => querySet.add(query));
    for (const story of epic.stories) {
      story.docsQueries.forEach((query) => querySet.add(query));
      for (const task of story.tasks) {
        task.docsQueries.forEach((query) => querySet.add(query));
      }
    }
  }

  const queries = Array.from(querySet).slice(0, 8);
  const results = await Promise.all(
    queries.map(async (query) => {
      const docs = await queryMCP(query, "PlanningBabysitter", env.MCP_API_URL);
      return [query, excerpt(docs)] as const;
    }),
  );

  return new Map(results);
}

function normalizeBreakdown(markdown: string, raw: PlanningBreakdown): PlanningBreakdown {
  if (raw.epics.length > 0) {
    return raw;
  }

  return {
    title: raw.title || "Generated plan",
    summary: raw.summary || excerpt(markdown, 600),
    epics: [
      {
        title: raw.title || "Execution plan",
        description: raw.summary || excerpt(markdown, 800),
        docsQueries: [],
        stories: [
          {
            title: "Review generated plan",
            description: "Translate the raw markdown plan into implementation-ready tasks.",
            docsQueries: [],
            tasks: [
              {
                title: "Review and apply the generated plan",
                description: excerpt(markdown, 900),
                requirements: [],
                successCriteria: ["Plan has been reviewed and translated into executable work."],
                docsQueries: [],
              },
            ],
          },
        ],
      },
    ],
  };
}

export async function derivePlanBreakdownFromMarkdown(
  env: Env,
  input: {
    requestId: string;
    workstream: PlanningWorkstream;
    markdown: string;
    projectId?: string;
    projectName?: string;
  },
): Promise<PlanningBreakdown> {
  const prompt = [
    `Request ID: ${input.requestId}`,
    `Workstream: ${input.workstream}`,
    input.projectId ? `Project ID: ${input.projectId}` : null,
    input.projectName ? `Project Name: ${input.projectName}` : null,
    "",
    "Transform the markdown plan below into implementation-ready epics, stories, and tasks.",
    "Each task should be concrete, preserve Cloudflare-specific requirements, and include docs queries when Cloudflare platform details matter.",
    "",
    input.markdown,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await generateStructuredResponse<PlanningBreakdown>(
    env,
    prompt,
    zodToJsonSchema(PlanningBreakdownSchema as any, "planning_breakdown"),
    "Return only JSON for an implementation breakdown of the provided plan.",
  );

  return normalizeBreakdown(input.markdown, PlanningBreakdownSchema.parse(raw));
}

export async function persistDerivedPlansFromMarkdown(
  env: Env,
  input: {
    requestId: string;
    workstream: PlanningWorkstream;
    markdown: string;
    projectId?: string;
    projectName?: string;
  },
): Promise<PlanningBreakdown> {
  const breakdown = await derivePlanBreakdownFromMarkdown(env, input);
  await persistPlanBreakdown(env, input, breakdown);
  return breakdown;
}

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
  const now = new Date().toISOString();

  const planRows: Array<typeof projectPlans.$inferInsert> = [];
  let orderIndex = 0;

  breakdown.epics.forEach((epic, epicIndex) => {
    const epicId = `${input.requestId}:epic:${epicIndex + 1}`;
    planRows.push({
      id: epicId,
      projectId: targetProjectId,
      parentId: null,
      itemType: "epic",
      title: epic.title,
      description: epic.description,
      status: "todo",
      priority: "high",
      orderIndex: orderIndex++,
      metadataJson: JSON.stringify({
        requestId: input.requestId,
        workstream: input.workstream,
        docsQueries: epic.docsQueries,
        docsContext: epic.docsQueries.reduce<Record<string, string>>((accumulator, query) => {
          accumulator[query] = docsLookup.get(query) || "";
          return accumulator;
        }, {}),
      }),
      createdAt: now,
      updatedAt: now,
    });

    epic.stories.forEach((story, storyIndex) => {
      const storyId = `${input.requestId}:story:${epicIndex + 1}:${storyIndex + 1}`;
      planRows.push({
        id: storyId,
        projectId: targetProjectId,
        parentId: epicId,
        itemType: "story",
        title: story.title,
        description: story.description,
        status: "todo",
        priority: "medium",
        orderIndex: orderIndex++,
        metadataJson: JSON.stringify({
          requestId: input.requestId,
          workstream: input.workstream,
          docsQueries: story.docsQueries,
          docsContext: story.docsQueries.reduce<Record<string, string>>((accumulator, query) => {
            accumulator[query] = docsLookup.get(query) || "";
            return accumulator;
          }, {}),
        }),
        createdAt: now,
        updatedAt: now,
      });

      story.tasks.forEach((task, taskIndex) => {
        const taskId = `${input.requestId}:task:${epicIndex + 1}:${storyIndex + 1}:${taskIndex + 1}`;
        planRows.push({
          id: taskId,
          projectId: targetProjectId,
          parentId: storyId,
          itemType: "task",
          title: task.title,
          description: task.description,
          status: "todo",
          priority: "medium",
          assignee: task.assignee,
          orderIndex: orderIndex++,
          metadataJson: JSON.stringify({
            requestId: input.requestId,
            workstream: input.workstream,
            requirements: task.requirements,
            successCriteria: task.successCriteria,
            docsQueries: task.docsQueries,
            docsContext: task.docsQueries.reduce<Record<string, string>>((accumulator, query) => {
              accumulator[query] = docsLookup.get(query) || "";
              return accumulator;
            }, {}),
          }),
          createdAt: now,
          updatedAt: now,
        });
      });
    });
  });

  if (planRows.length > 0) {
    await db.insert(projectPlans).values(planRows);
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
      createdAt: now,
      updatedAt: now,
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
        updatedAt: now,
      },
    });

  const phases: Phase[] = breakdown.epics.map((epic, epicIndex) => {
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
      generatedDate: now,
      totalPhases: phases.length,
      phases,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: workshopProjectTasks.id,
      set: {
        projectName: workshopProjectName,
        generatedDate: now,
        totalPhases: phases.length,
        phases,
        updatedAt: now,
      },
    });

  return breakdown;
}
