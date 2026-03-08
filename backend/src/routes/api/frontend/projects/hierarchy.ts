/**
 * @file hierarchy.ts
 * @description Project management item hierarchy (Epics, Stories, Tasks).
 * Merged from the legacy standalone projects API for unified management.
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, asc } from "drizzle-orm";
import { getDb } from "@db";
import { pmProjects, pmEpics, pmStories, pmTasks } from "@db/schemas/projects/hierarchy";
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

/**
 * GET /:projectId
 * Retrieves the full hierarchical structure of a project.
 */
app.get("/:projectId", async (c) => {
  const db = getDb(c.env.DB);
  const project = await db.query.pmProjects.findFirst({
    where: eq(pmProjects.id, c.req.param("projectId")),
    with: {
      epics: {
        orderBy: [asc(pmEpics.createdAt)],
        with: {
          stories: {
             orderBy: [asc(pmStories.createdAt)],
             with: {
                tasks: { orderBy: [asc(pmTasks.order), asc(pmTasks.createdAt)] }
             }
          }
        }
      }
    }
  });
  return c.json(project || { error: "Not found" }, project ? 200 : 404);
});

/**
 * POST /:projectId
 * Adds a new hierarchical item (Epic, Story, or Task) to the project.
 */
app.post("/:projectId", zValidator("json", CreateItemSchema), async (c) => {
  const { type, parentId, data } = c.req.valid("json");
  const db = getDb(c.env.DB);
  const newId = generateUuid();
  let result;

  if (type === 'epic') [result] = await db.insert(pmEpics).values({ id: newId, projectId: parentId, ...data }).returning();
  else if (type === 'story') [result] = await db.insert(pmStories).values({ id: newId, epicId: parentId, ...data }).returning();
  else if (type === 'task') [result] = await db.insert(pmTasks).values({ id: newId, storyId: parentId, ...data }).returning();

  return c.json(result, 201);
});

export default app;
