import { z } from "zod";

// Base Schemas (Mirrors backend Drizzle schemas but pure Zod)
export const ProjectSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  status: z.enum(["todo", "in_progress", "done", "backlog"]).default("todo"),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});

export const EpicSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  status: z.enum(["todo", "in_progress", "done", "backlog"]).default("todo"),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});

export const StorySchema = z.object({
  id: z.string(),
  epicId: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  status: z.enum(["todo", "in_progress", "done", "backlog"]).default("todo"),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});

export const TaskSchema = z.object({
  id: z.string(),
  storyId: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  status: z.enum(["todo", "in_progress", "done", "backlog"]).default("todo"),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  order: z.number().optional(),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});

// Enums
export const StatusSchema = z.enum(["todo", "in_progress", "done", "backlog"]);
export const PrioritySchema = z.enum(["low", "medium", "high", "urgent"]);

// Schema for updating ANY item (Project, Epic, Story, or Task)
export const UpdateItemSchema = z.object({
  type: z.enum(["project", "epic", "story", "task"]),
  parentId: z.string().optional(), // For creation
  id: z.string().uuid().optional(), // Optional for creation, required for update usually
  data: z.object({
    title: z.string().min(1, "Title is required").optional(),
    description: z.string().optional(),
    status: StatusSchema.optional(),
    priority: PrioritySchema.optional(),
    order: z.number().optional(),
  }),
});

// Input Types
export type UpdateItemInput = z.infer<typeof UpdateItemSchema>;
