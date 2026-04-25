import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { epics, sprints, stories, tasks } from "@/db/schemas/projects/backlog";

export const EpicSchema = createSelectSchema(epics);
export type Epic = z.infer<typeof EpicSchema>;

export const SprintSchema = createSelectSchema(sprints);
export type Sprint = z.infer<typeof SprintSchema>;

export const UserStorySchema = createSelectSchema(stories);
export type UserStory = z.infer<typeof UserStorySchema>;

export const SWARMTaskSchema = createSelectSchema(tasks);
export type SWARMTask = z.infer<typeof SWARMTaskSchema>;

import type { PersistentAgentState } from "@/ai/providers/agent-support/types";

export interface OrchestratorState extends PersistentAgentState {
  epics: Record<string, Epic>;
  stories: Record<string, UserStory>;
  tasks: Record<string, SWARMTask>;
  sprints: Record<string, Sprint>;
  sessionId: string;
}
