
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

// Enums aren't native to SQLite, so we use text with validation in application layer
// We use 'pm_' prefix to avoid collision with existing tables

// 1. Projects (The Root)
export const pmProjects = sqliteTable("pm_projects", {
  id: text("id").primaryKey(), // UUID
  workspaceId: text("workspace_id").notNull(), // Links to project route
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").$type<"todo" | "in_progress" | "done" | "backlog">().default("todo"),
  createdAt: integer("created_at", { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// 2. Epics
export const pmEpics = sqliteTable("pm_epics", {
  id: text("id").primaryKey(), // UUID
  projectId: text("project_id").references(() => pmProjects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").$type<"todo" | "in_progress" | "done" | "backlog">().default("todo"),
  priority: text("priority").$type<"low" | "medium" | "high" | "urgent">().default("medium"),
  createdAt: integer("created_at", { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// 3. User Stories
export const pmStories = sqliteTable("pm_stories", {
  id: text("id").primaryKey(), // UUID
  epicId: text("epic_id").references(() => pmEpics.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").$type<"todo" | "in_progress" | "done" | "backlog">().default("todo"),
  priority: text("priority").$type<"low" | "medium" | "high" | "urgent">().default("medium"),
  createdAt: integer("created_at", { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// 4. Tasks (The leaf nodes)
export const pmTasks = sqliteTable("pm_tasks", {
  id: text("id").primaryKey(), // UUID
  storyId: text("story_id").references(() => pmStories.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").$type<"todo" | "in_progress" | "done" | "backlog">().default("todo"),
  priority: text("priority").$type<"low" | "medium" | "high" | "urgent">().default("medium"),
  order: integer("order").default(0), // Useful for Kanban sorting
  createdAt: integer("created_at", { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// --- Relations for easy Deep Nesting Queries ---

export const pmProjectRelations = relations(pmProjects, ({ many }) => ({
  epics: many(pmEpics),
}));

export const pmEpicRelations = relations(pmEpics, ({ one, many }) => ({
  project: one(pmProjects, { fields: [pmEpics.projectId], references: [pmProjects.id] }),
  stories: many(pmStories),
}));

export const pmStoryRelations = relations(pmStories, ({ one, many }) => ({
  epic: one(pmEpics, { fields: [pmStories.epicId], references: [pmEpics.id] }),
  tasks: many(pmTasks),
}));

export const pmTaskRelations = relations(pmTasks, ({ one }) => ({
  story: one(pmStories, { fields: [pmTasks.storyId], references: [pmStories.id] }),
}));
