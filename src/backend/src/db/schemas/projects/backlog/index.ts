import { relations } from "drizzle-orm";
import { repositories } from "@/db/schemas/github/repos";
import { planRevisions } from "../plans/revisions";
import { phases } from "./phases";
import { sprints } from "./sprints";
import { epics } from "./epics";
import { stories } from "./stories";
import { tasks, taskComments } from "./tasks";
import * as mappings from "./mappings";

export const phaseRelations = relations(phases, ({ one, many }) => ({
    repo: one(repositories, { fields: [phases.repoId], references: [repositories.id] }),
    planRevision: one(planRevisions, { fields: [phases.planRevisionId], references: [planRevisions.id] }),
    sprints: many(mappings.phaseSprintsMap),
    epics: many(mappings.phaseEpicsMap),
}));

export const sprintRelations = relations(sprints, ({ one, many }) => ({
    repo: one(repositories, { fields: [sprints.repoId], references: [repositories.id] }),
    planRevision: one(planRevisions, { fields: [sprints.planRevisionId], references: [planRevisions.id] }),
    phases: many(mappings.phaseSprintsMap),
    epics: many(mappings.sprintEpicsMap),
}));

export const epicRelations = relations(epics, ({ one, many }) => ({
    repo: one(repositories, { fields: [epics.repoId], references: [repositories.id] }),
    planRevision: one(planRevisions, { fields: [epics.planRevisionId], references: [planRevisions.id] }),
    phases: many(mappings.phaseEpicsMap),
    sprints: many(mappings.sprintEpicsMap),
    parentEpics: many(mappings.epicEpicsMap, { relationName: "childEpics" }),
    childEpics: many(mappings.epicEpicsMap, { relationName: "parentEpics" }),
    stories: many(mappings.epicStoriesMap),
    tasks: many(mappings.epicTasksMap),
}));

export const storyRelations = relations(stories, ({ one, many }) => ({
    repo: one(repositories, { fields: [stories.repoId], references: [repositories.id] }),
    planRevision: one(planRevisions, { fields: [stories.planRevisionId], references: [planRevisions.id] }),
    epics: many(mappings.epicStoriesMap),
    parentStories: many(mappings.storyStoriesMap, { relationName: "childStories" }),
    childStories: many(mappings.storyStoriesMap, { relationName: "parentStories" }),
    tasks: many(mappings.storyTasksMap),
}));

export const taskRelations = relations(tasks, ({ one, many }) => ({
    repo: one(repositories, { fields: [tasks.repoId], references: [repositories.id] }),
    planRevision: one(planRevisions, { fields: [tasks.planRevisionId], references: [planRevisions.id] }),
    epics: many(mappings.epicTasksMap),
    stories: many(mappings.storyTasksMap),
    parentTasks: many(mappings.taskTasksMap, { relationName: "childTasks" }),
    childTasks: many(mappings.taskTasksMap, { relationName: "parentTasks" }),
    comments: many(taskComments)
}));

export const taskCommentRelations = relations(taskComments, ({ one }) => ({
    task: one(tasks, { fields: [taskComments.taskId], references: [tasks.id] }),
}));

// Provide relations for the mapping tables
export const phaseSprintsMapRelations = relations(mappings.phaseSprintsMap, ({ one }) => ({
    phase: one(phases, { fields: [mappings.phaseSprintsMap.phaseId], references: [phases.id] }),
    sprint: one(sprints, { fields: [mappings.phaseSprintsMap.sprintId], references: [sprints.id] }),
}));

export const phaseEpicsMapRelations = relations(mappings.phaseEpicsMap, ({ one }) => ({
    phase: one(phases, { fields: [mappings.phaseEpicsMap.phaseId], references: [phases.id] }),
    epic: one(epics, { fields: [mappings.phaseEpicsMap.epicId], references: [epics.id] }),
}));

export const sprintEpicsMapRelations = relations(mappings.sprintEpicsMap, ({ one }) => ({
    sprint: one(sprints, { fields: [mappings.sprintEpicsMap.sprintId], references: [sprints.id] }),
    epic: one(epics, { fields: [mappings.sprintEpicsMap.epicId], references: [epics.id] }),
}));

export const epicEpicsMapRelations = relations(mappings.epicEpicsMap, ({ one }) => ({
    parentEpic: one(epics, { fields: [mappings.epicEpicsMap.parentEpicId], references: [epics.id], relationName: "childEpics" }),
    childEpic: one(epics, { fields: [mappings.epicEpicsMap.childEpicId], references: [epics.id], relationName: "parentEpics" }),
}));

export const epicStoriesMapRelations = relations(mappings.epicStoriesMap, ({ one }) => ({
    epic: one(epics, { fields: [mappings.epicStoriesMap.epicId], references: [epics.id] }),
    story: one(stories, { fields: [mappings.epicStoriesMap.storyId], references: [stories.id] }),
}));

export const epicTasksMapRelations = relations(mappings.epicTasksMap, ({ one }) => ({
    epic: one(epics, { fields: [mappings.epicTasksMap.epicId], references: [epics.id] }),
    task: one(tasks, { fields: [mappings.epicTasksMap.taskId], references: [tasks.id] }),
}));

export const storyStoriesMapRelations = relations(mappings.storyStoriesMap, ({ one }) => ({
    parentStory: one(stories, { fields: [mappings.storyStoriesMap.parentStoryId], references: [stories.id], relationName: "childStories" }),
    childStory: one(stories, { fields: [mappings.storyStoriesMap.childStoryId], references: [stories.id], relationName: "parentStories" }),
}));

export const storyTasksMapRelations = relations(mappings.storyTasksMap, ({ one }) => ({
    story: one(stories, { fields: [mappings.storyTasksMap.storyId], references: [stories.id] }),
    task: one(tasks, { fields: [mappings.storyTasksMap.taskId], references: [tasks.id] }),
}));

export const taskTasksMapRelations = relations(mappings.taskTasksMap, ({ one }) => ({
    parentTask: one(tasks, { fields: [mappings.taskTasksMap.parentTaskId], references: [tasks.id], relationName: "childTasks" }),
    childTask: one(tasks, { fields: [mappings.taskTasksMap.childTaskId], references: [tasks.id], relationName: "parentTasks" }),
}));

// -- Export all tables
export * from "./phases";
export * from "./sprints";
export * from "./epics";
export * from "./stories";
export * from "./tasks";
export * from "./mappings";