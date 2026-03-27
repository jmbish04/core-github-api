import { relations } from "drizzle-orm";
import { epics } from "./epics";
import { stories } from "./stories";
import { tasks, taskComments } from "./tasks";
import { repositories } from "@/db/schemas/github/repos";


// --- Relations for Deep Nesting Queries ---
export const epicRelations = relations(epics, ({ many, one }) => ({
    repo: one(repositories, { fields: [epics.repoId], references: [repositories.id] }),
    stories: many(stories),
}));

export const storyRelations = relations(stories, ({ one, many }) => ({
    epic: one(epics, { fields: [stories.parentId], references: [epics.id] }),
    repo: one(repositories, { fields: [stories.repoId], references: [repositories.id] }),
    tasks: many(tasks),
}));

export const taskRelations = relations(tasks, ({ one, many }) => ({
    story: one(stories, { fields: [tasks.parentId], references: [stories.id] }),
    repo: one(repositories, { fields: [tasks.repoId], references: [repositories.id] }),
    comments: many(taskComments)
}));

export const taskCommentRelations = relations(taskComments, ({ one }) => ({
    task: one(tasks, { fields: [taskComments.taskId], references: [tasks.id] }),
}));


// -- Export all tables
export * from "./epics";
export * from "./stories";
export * from "./tasks";