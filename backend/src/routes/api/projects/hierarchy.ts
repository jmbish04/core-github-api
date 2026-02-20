import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, desc, asc } from "drizzle-orm";
import { getDb } from "@db";
import { pmProjects, pmEpics, pmStories, pmTasks } from "@db/schemas/projects/hierarchy";
import { generateUuid } from "@/utils/common";

export const hierarchyRouter = new Hono<{ Bindings: Env }>();

// Validation Schemas (Shared Logic)
const UpdateItemSchema = z.object({
  type: z.enum(["project", "epic", "story", "task"]),
  id: z.string(), // Creating items might need ID, or we gen server side. For updates ID is needed in path usually, but here payload has it.
  data: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(["todo", "in_progress", "done", "backlog"]).optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    order: z.number().optional(),
  }),
});

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

const DeleteItemSchema = z.object({
  type: z.enum(["epic", "story", "task"]),
  id: z.string(),
});


// 0. Get Full Hierarchy for a Project
hierarchyRouter.get("/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  const db = getDb(c.env.DB);
  
  // Drizzle Query API for deep nesting
  const project = await db.query.pmProjects.findFirst({
    where: eq(pmProjects.id, projectId),
    with: {
      epics: {
        orderBy: [asc(pmEpics.createdAt)],
        with: {
          stories: {
             orderBy: [asc(pmStories.createdAt)],
             with: {
                tasks: {
                    orderBy: [asc(pmTasks.order), asc(pmTasks.createdAt)]
                }
             }
          }
        }
      }
    }
  });

  if (!project) return c.json({ error: "Project not found" }, 404);
  return c.json(project);
});

// 1. Create Item
hierarchyRouter.post("/:projectId", zValidator("json", CreateItemSchema), async (c) => {
  const { type, parentId, data } = c.req.valid("json");
  const db = getDb(c.env.DB);
  const newId = generateUuid();

  let result;
  if (type === 'epic') {
    // Parent is Project
    [result] = await db.insert(pmEpics).values({
        id: newId,
        projectId: parentId,
        ...data
    }).returning();
  } else if (type === 'story') {
    // Parent is Epic
    [result] = await db.insert(pmStories).values({
        id: newId,
        epicId: parentId,
        ...data
    }).returning();
  } else if (type === 'task') {
    // Parent is Story
    [result] = await db.insert(pmTasks).values({
        id: newId,
        storyId: parentId,
        ...data
    }).returning();
  }

  return c.json(result, 201);
});

// 2. Update Item
hierarchyRouter.patch("/:projectId", zValidator("json", UpdateItemSchema), async (c) => {
  const { type, id, data } = c.req.valid("json");
  const db = getDb(c.env.DB);

  let table;
  if(type === 'project') table = pmProjects;
  if(type === 'epic') table = pmEpics;
  if(type === 'story') table = pmStories;
  if(type === 'task') table = pmTasks;

  if(!table) return c.json({error: "Invalid type"}, 400);

  await db.update(table)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(table.id, id));

  return c.json({ success: true });
});

// 3. Delete Item
hierarchyRouter.delete("/:projectId", zValidator("json", DeleteItemSchema), async (c) => {
    const { type, id } = c.req.valid("json");
    const db = getDb(c.env.DB);

    let table;
    if(type === 'epic') table = pmEpics;
    if(type === 'story') table = pmStories;
    if(type === 'task') table = pmTasks;
    
    // Project deletion usually separate or cascading? Allow explicit only?
    // Start with sub-items
  
    if(!table) return c.json({error: "Invalid type"}, 400);
  
    await db.delete(table).where(eq(table.id, id));
  
    return c.json({ success: true, deletedId: id });
});
