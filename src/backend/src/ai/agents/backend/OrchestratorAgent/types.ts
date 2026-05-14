import { createSelectSchema } from "drizzle-zod";
import { type InferSelectModel } from "drizzle-orm";
import { epics, sprints, stories, tasks } from "@/db/schemas/projects/backlog";

export const EpicSchema = createSelectSchema(epics) as any;
export type Epic = InferSelectModel<typeof epics>;

export const SprintSchema = createSelectSchema(sprints) as any;
export type Sprint = InferSelectModel<typeof sprints>;

export const UserStorySchema = createSelectSchema(stories) as any;
export type UserStory = InferSelectModel<typeof stories>;

export const SWARMTaskSchema = createSelectSchema(tasks) as any;
export type SWARMTask = InferSelectModel<typeof tasks>;

import type { PersistentAgentState } from "@/ai/providers/agent-support/types";

export interface OrchestratorState extends PersistentAgentState {
  epics: Record<string, Epic>;
  stories: Record<string, UserStory>;
  tasks: Record<string, SWARMTask>;
  sprints: Record<string, Sprint>;
  sessionId: string;
}
