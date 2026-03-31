/**
 * @file hierarchy.ts
 * @description Project management item hierarchy (Epics, Stories, Tasks).
 * Merged from the legacy standalone projects API for unified management.
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, asc } from "drizzle-orm";
import { getDb, repositories, epics as dbEpics, stories as dbStories, tasks as dbTasks } from "@db";
import { generateUuid } from "./utils";

const app = new Hono<{ Bindings: Env }>();

const CreateItemSchema = z.object({
  type: z.enum(["epic", "story", "task"]),
  parentId: z.string(),
  data: z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
    status: z.enum(["todo", "in_progress", "done", "backlog"]).default("todo"),
  }),
});

const UpdateItemSchema = z.object({
  type: z.enum(["epic", "story", "task"]),
  id: z.string(),
  parentId: z.string().optional(),
  data: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    status: z.enum(["todo", "in_progress", "done", "backlog"]).optional(),
  }).optional(),
});

const DeleteItemSchema = z.object({
  type: z.enum(["epic", "story", "task"]),
  id: z.string()
});

/**
 * GET /:projectId
 * Retrieves the full hierarchical structure of a project.
 */
app.get("/:projectId/hierarchy", async (c) => {
  const db = getDb(c.env.DB);
  const repo = await db.select().from(repositories).where(eq(repositories.id, c.req.param("projectId"))).get();
  if (!repo) return c.json({ error: "Not found" }, 404);

  const epics = await db.select().from(dbEpics).where(eq(dbEpics.repoId, repo.id)).orderBy(asc(dbEpics.createdAt));
  const stories = await db.select().from(dbStories).where(eq(dbStories.repoId, repo.id)).orderBy(asc(dbStories.createdAt));
  const tasks = await db.select().from(dbTasks).where(eq(dbTasks.repoId, repo.id)).orderBy(asc(dbTasks.createdAt));

  // Assemble hierarchy in-memory
  const epicsWithStories = epics.map(epic => ({
    ...epic,
    stories: stories.filter(story => story.parentId === epic.id).map(story => ({
      ...story,
      tasks: tasks.filter(task => task.parentId === story.id)
    }))
  }));

  return c.json({ ...repo, epics: epicsWithStories }, 200);
});

/**
 * POST /:projectId
 * Adds a new hierarchical item (Epic, Story, or Task) to the project.
 */
app.post("/:projectId/hierarchy", zValidator("json", CreateItemSchema), async (c) => {
  const { type, parentId, data } = c.req.valid("json");
  const db = getDb(c.env.DB);
  const newId = generateUuid();
  let result;

  if (type === 'epic') [result] = await db.insert(dbEpics).values({ id: newId, repoId: parentId, ...data }).returning();
  else if (type === 'story') {
    // Requires getting the repoId from epic 
    const epic = await db.select().from(dbEpics).where(eq(dbEpics.id, parentId)).get();
    [result] = await db.insert(dbStories).values({ id: newId, parentId: parentId, repoId: epic?.repoId || '', ...data }).returning();
  }
  else if (type === 'task') {
    const story = await db.select().from(dbStories).where(eq(dbStories.id, parentId)).get();
    [result] = await db.insert(dbTasks).values({ id: newId, parentId: parentId, repoId: story?.repoId || '', ...data }).returning();
  }

  return c.json(result, 201);
});

/**
 * PATCH /:projectId/hierarchy
 * Updates an item's data or moves it to a new parent.
 */
app.patch("/:projectId/hierarchy", zValidator("json", UpdateItemSchema), async (c) => {
  const { id, type, parentId, data } = c.req.valid("json");
  const db = getDb(c.env.DB);
  
  const updatePayload: any = { ...data };
  if (parentId && type === "epic") updatePayload.repoId = parentId;
  else if (parentId) updatePayload.parentId = parentId;

  let result;
  // Note: if reparenting across repos, we would also need to update repoId, 
  // but this API inherently acts within a single project.
  if (type === 'epic') [result] = await db.update(dbEpics).set(updatePayload).where(eq(dbEpics.id, id)).returning();
  else if (type === 'story') [result] = await db.update(dbStories).set(updatePayload).where(eq(dbStories.id, id)).returning();
  else if (type === 'task') [result] = await db.update(dbTasks).set(updatePayload).where(eq(dbTasks.id, id)).returning();

  if (!result) return c.json({ error: "Item not found" }, 404);
  return c.json(result, 200);
});

/**
 * DELETE /:projectId/hierarchy
 * Deletes an item from the hierarchy.
 */
app.delete("/:projectId/hierarchy", zValidator("json", DeleteItemSchema), async (c) => {
  const { type, id } = c.req.valid("json");
  const db = getDb(c.env.DB);

  let result;
  if (type === 'epic') [result] = await db.delete(dbEpics).where(eq(dbEpics.id, id)).returning();
  else if (type === 'story') [result] = await db.delete(dbStories).where(eq(dbStories.id, id)).returning();
  else if (type === 'task') [result] = await db.delete(dbTasks).where(eq(dbTasks.id, id)).returning();

  if (!result) return c.json({ error: "Item not found" }, 404);
  return c.json({ success: true }, 200);
});

export default app;
