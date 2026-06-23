import {
    sqliteTable,
    text,
    primaryKey,
    index,
} from "drizzle-orm/sqlite-core";
import { phases } from "./phases";
import { sprints } from "./sprints";
import { epics } from "./epics";
import { stories } from "./stories";
import { tasks } from "./tasks";

export const phaseSprintsMap = sqliteTable("phase_sprints_map", {
    phaseId: text("phase_id").notNull().references(() => phases.id, { onDelete: "cascade" }),
    sprintId: text("sprint_id").notNull().references(() => sprints.id, { onDelete: "cascade" }),
}, (t) => ({
    pk: primaryKey({ columns: [t.phaseId, t.sprintId] }),
    phaseIdx: index("idx_phase_sprints_phase").on(t.phaseId),
    sprintIdx: index("idx_phase_sprints_sprint").on(t.sprintId),
}));

export const phaseEpicsMap = sqliteTable("phase_epics_map", {
    phaseId: text("phase_id").notNull().references(() => phases.id, { onDelete: "cascade" }),
    epicId: text("epic_id").notNull().references(() => epics.id, { onDelete: "cascade" }),
}, (t) => ({
    pk: primaryKey({ columns: [t.phaseId, t.epicId] }),
    phaseIdx: index("idx_phase_epics_phase").on(t.phaseId),
    epicIdx: index("idx_phase_epics_epic").on(t.epicId),
}));

export const sprintEpicsMap = sqliteTable("sprint_epics_map", {
    sprintId: text("sprint_id").notNull().references(() => sprints.id, { onDelete: "cascade" }),
    epicId: text("epic_id").notNull().references(() => epics.id, { onDelete: "cascade" }),
}, (t) => ({
    pk: primaryKey({ columns: [t.sprintId, t.epicId] }),
    sprintIdx: index("idx_sprint_epics_sprint").on(t.sprintId),
    epicIdx: index("idx_sprint_epics_epic").on(t.epicId),
}));

export const epicEpicsMap = sqliteTable("epic_epics_map", {
    parentEpicId: text("parent_epic_id").notNull().references(() => epics.id, { onDelete: "cascade" }),
    childEpicId: text("child_epic_id").notNull().references(() => epics.id, { onDelete: "cascade" }),
}, (t) => ({
    pk: primaryKey({ columns: [t.parentEpicId, t.childEpicId] }),
    parentIdx: index("idx_epic_epics_parent").on(t.parentEpicId),
    childIdx: index("idx_epic_epics_child").on(t.childEpicId),
}));

export const epicStoriesMap = sqliteTable("epic_stories_map", {
    epicId: text("epic_id").notNull().references(() => epics.id, { onDelete: "cascade" }),
    storyId: text("story_id").notNull().references(() => stories.id, { onDelete: "cascade" }),
}, (t) => ({
    pk: primaryKey({ columns: [t.epicId, t.storyId] }),
    epicIdx: index("idx_epic_stories_epic").on(t.epicId),
    storyIdx: index("idx_epic_stories_story").on(t.storyId),
}));

export const epicTasksMap = sqliteTable("epic_tasks_map", {
    epicId: text("epic_id").notNull().references(() => epics.id, { onDelete: "cascade" }),
    taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
}, (t) => ({
    pk: primaryKey({ columns: [t.epicId, t.taskId] }),
    epicIdx: index("idx_epic_tasks_epic").on(t.epicId),
    taskIdx: index("idx_epic_tasks_task").on(t.taskId),
}));

export const storyStoriesMap = sqliteTable("story_stories_map", {
    parentStoryId: text("parent_story_id").notNull().references(() => stories.id, { onDelete: "cascade" }),
    childStoryId: text("child_story_id").notNull().references(() => stories.id, { onDelete: "cascade" }),
}, (t) => ({
    pk: primaryKey({ columns: [t.parentStoryId, t.childStoryId] }),
    parentIdx: index("idx_story_stories_parent").on(t.parentStoryId),
    childIdx: index("idx_story_stories_child").on(t.childStoryId),
}));

export const storyTasksMap = sqliteTable("story_tasks_map", {
    storyId: text("story_id").notNull().references(() => stories.id, { onDelete: "cascade" }),
    taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
}, (t) => ({
    pk: primaryKey({ columns: [t.storyId, t.taskId] }),
    storyIdx: index("idx_story_tasks_story").on(t.storyId),
    taskIdx: index("idx_story_tasks_task").on(t.taskId),
}));

export const taskTasksMap = sqliteTable("task_tasks_map", {
    parentTaskId: text("parent_task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    childTaskId: text("child_task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
}, (t) => ({
    pk: primaryKey({ columns: [t.parentTaskId, t.childTaskId] }),
    parentIdx: index("idx_task_tasks_parent").on(t.parentTaskId),
    childIdx: index("idx_task_tasks_child").on(t.childTaskId),
}));
