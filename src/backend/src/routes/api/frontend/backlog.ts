import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createInsertSchema } from "drizzle-zod";
import { getDb } from "@/db";
import * as backlogSchema from "@/db/schemas/projects/backlog";
import { eq } from "drizzle-orm";

const app = new Hono<{ Bindings: Env }>();

// Drizzle-Zod Base Schemas
const baseTaskInputSchema = createInsertSchema(backlogSchema.tasks).pick({
  id: true,
  title: true,
  description: true,
  status: true,
}).extend({
  id: z.string().optional(),
  status: z.enum(["todo", "in_progress", "done", "backlog"]).optional(),
});

const baseStoryInputSchema = createInsertSchema(backlogSchema.stories).pick({
  id: true,
  title: true,
  description: true,
  status: true,
}).extend({
  id: z.string().optional(),
  status: z.enum(["todo", "in_progress", "done", "backlog"]).optional(),
});

const baseEpicInputSchema = createInsertSchema(backlogSchema.epics).pick({
  id: true,
  title: true,
  description: true,
  status: true,
}).extend({
  id: z.string().optional(),
  status: z.enum(["todo", "in_progress", "done", "backlog"]).optional(),
});

const baseSprintInputSchema = createInsertSchema(backlogSchema.sprints).pick({
  id: true,
  title: true,
  description: true,
  status: true,
}).extend({
  id: z.string().optional(),
  status: z.enum(["todo", "in_progress", "done", "backlog"]).optional(),
});

const basePhaseInputSchema = createInsertSchema(backlogSchema.phases).pick({
  id: true,
  title: true,
  description: true,
  status: true,
}).extend({
  id: z.string().optional(),
  status: z.enum(["todo", "in_progress", "done", "backlog"]).optional(),
});

// Recursive Schema Definitions for Input
type TaskInput = z.infer<typeof baseTaskInputSchema> & {
  tasks?: TaskInput[];
};

type BacklogStatus = "todo" | "in_progress" | "done" | "backlog";

const TaskInputSchema: z.ZodType<TaskInput> = z.lazy(() =>
  baseTaskInputSchema.extend({
    tasks: z.array(TaskInputSchema).optional(),
  })
);

const StoryInputSchema = baseStoryInputSchema.extend({
  tasks: z.array(TaskInputSchema).optional(),
});

const EpicInputSchema = baseEpicInputSchema.extend({
  stories: z.array(StoryInputSchema).optional(),
  tasks: z.array(TaskInputSchema).optional(),
});

const SprintInputSchema = baseSprintInputSchema.extend({
  epics: z.array(EpicInputSchema).optional(),
});

const PhaseInputSchema = basePhaseInputSchema.extend({
  sprints: z.array(SprintInputSchema).optional(),
  epics: z.array(EpicInputSchema).optional(),
});

const BacklogInputSchema = z.object({
  phases: z.array(PhaseInputSchema),
  planRevisionId: z.string().optional()
});

/**
 * GET /api/repos/:owner/:repo/backlog
 * Retrieves the fully hydrated hierarchy for the repository
 */
app.get("/:owner/:repo/backlog", async (c) => {
  const db = getDb(c.env.DB);
  const repoOwner = c.req.param("owner");
  const repoName = c.req.param("repo");
  const parsedRepoId = `${repoOwner}/${repoName}`;

  try {
    const fullHierarchy = await db.query.phases.findMany({
      where: eq(backlogSchema.phases.repoId, parsedRepoId),
      with: {
        sprints: {
          with: {
            sprint: {
              with: {
                epics: {
                  with: {
                    epic: {
                      with: {
                        stories: {
                          with: {
                            story: {
                              with: {
                                tasks: {
                                  with: {
                                    task: {
                                      with: {
                                        childTasks: {
                                          with: { childTask: true }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        },
                        tasks: {
                          with: {
                            task: true
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        epics: {
          with: {
            epic: true
          }
        }
      }
    });

    return c.json({ success: true, data: fullHierarchy });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * PUT /api/repos/:owner/:repo/backlog
 * Accepts a full nested hierarchy and normalizes it into the flat tables and mapping tables.
 */
app.put(
  "/:owner/:repo/backlog",
  zValidator("json", BacklogInputSchema),
  async (c) => {
    const db = getDb(c.env.DB);
    const repoOwner = c.req.param("owner");
    const repoName = c.req.param("repo");
    const repoId = `${repoOwner}/${repoName}`;
    const body = c.req.valid("json");

    try {
      const planRevId = body.planRevisionId || null;

      // For a magical normalization put action representing the entire state,
      // easiest is to map ids and establish links inside a transaction.
      await db.transaction(async (tx) => {
        // Since we are receiving a unified state, we might ideally want to clear existing 
        // to avoid orphans, or do an upsert. Given SQLite/D1, let's do upserts.
        
        for (const phase of body.phases) {
          const phaseId = phase.id || crypto.randomUUID();
          
          await tx.insert(backlogSchema.phases).values({
            id: phaseId,
            repoId,
            title: phase.title,
            description: phase.description || null,
            status: (phase.status as BacklogStatus) || "todo",
            planRevisionId: planRevId,
          }).onConflictDoUpdate({
            target: backlogSchema.phases.id,
            set: {
              title: phase.title,
              description: phase.description || null,
              status: (phase.status as BacklogStatus) || "todo",
              planRevisionId: planRevId,
            }
          });

          // Handle Phase Sprints
          if (phase.sprints) {
            for (const sprint of phase.sprints) {
              const sprintId = sprint.id || crypto.randomUUID();
              await tx.insert(backlogSchema.sprints).values({
                id: sprintId,
                repoId,
                title: sprint.title,
                description: sprint.description || null,
                status: (sprint.status as BacklogStatus) || "todo",
                planRevisionId: planRevId,
              }).onConflictDoUpdate({
                target: backlogSchema.sprints.id,
                set: {
                  title: sprint.title,
                  description: sprint.description || null,
                  status: (sprint.status as BacklogStatus) || "todo",
                  planRevisionId: planRevId,
                }
              });

              // Map Phase to Sprint
              await tx.insert(backlogSchema.phaseSprintsMap).values({
                phaseId: phaseId,
                sprintId: sprintId,
              }).onConflictDoNothing();

              // Handle Sprint Epics
              if (sprint.epics) {
                for (const epic of sprint.epics) {
                  const epicId = epic.id || crypto.randomUUID();
                  await tx.insert(backlogSchema.epics).values({
                    id: epicId,
                    repoId,
                    title: epic.title,
                    description: epic.description || null,
                    status: (epic.status as BacklogStatus) || "todo",
                    planRevisionId: planRevId,
                  }).onConflictDoUpdate({
                    target: backlogSchema.epics.id,
                    set: {
                      title: epic.title,
                      description: epic.description || null,
                      status: (epic.status as BacklogStatus) || "todo",
                      planRevisionId: planRevId,
                    }
                  });

                  await tx.insert(backlogSchema.sprintEpicsMap).values({
                    sprintId: sprintId,
                    epicId: epicId,
                  }).onConflictDoNothing();

                  if (epic.stories) {
                    for (const story of epic.stories) {
                      const storyId = story.id || crypto.randomUUID();
                      await tx.insert(backlogSchema.stories).values({
                        id: storyId,
                        repoId,
                        title: story.title,
                        description: story.description || null,
                        status: (story.status as BacklogStatus) || "todo",
                        planRevisionId: planRevId,
                      }).onConflictDoUpdate({
                        target: backlogSchema.stories.id,
                        set: {
                          title: story.title,
                          description: story.description || null,
                          status: (story.status as BacklogStatus) || "todo",
                          planRevisionId: planRevId,
                        }
                      });

                      await tx.insert(backlogSchema.epicStoriesMap).values({
                        epicId: epicId,
                        storyId: storyId,
                      }).onConflictDoNothing();

                      if (story.tasks) {
                         for (const task of story.tasks) {
                            const taskId = task.id || crypto.randomUUID();
                            await tx.insert(backlogSchema.tasks).values({
                              id: taskId,
                              repoId,
                              title: task.title,
                              description: task.description || null,
                              status: task.status || "todo", // Make sure to only match up to 1500 chars in replacement
                              planRevisionId: planRevId,
                            }).onConflictDoUpdate({
                              target: backlogSchema.tasks.id,
                              set: {
                                title: task.title,
                                description: task.description || null,
                                status: (task.status as BacklogStatus) || "todo",
                                planRevisionId: planRevId,
                              }
                            });

                            await tx.insert(backlogSchema.storyTasksMap).values({
                              storyId: storyId,
                              taskId: taskId,
                            }).onConflictDoNothing();
                         }
                      }
                    }
                  }

                  if (epic.tasks) {
                     for (const task of epic.tasks) {
                        const taskId = task.id || crypto.randomUUID();
                        await tx.insert(backlogSchema.tasks).values({
                          id: taskId,
                          repoId,
                          title: task.title,
                          description: task.description || null,
                          status: task.status || "todo",
                          planRevisionId: planRevId,
                        }).onConflictDoUpdate({
                          target: backlogSchema.tasks.id,
                          set: {
                            title: task.title,
                            description: task.description || null,
                            status: (task.status as BacklogStatus) || "todo",
                            planRevisionId: planRevId,
                          }
                        });

                        await tx.insert(backlogSchema.epicTasksMap).values({
                          epicId: epicId,
                          taskId: taskId,
                        }).onConflictDoNothing();
                     }
                  }
                }
              }
            }
          }

          if (phase.epics) {
            for (const epic of phase.epics) {
              const epicId = epic.id || crypto.randomUUID();
              await tx.insert(backlogSchema.epics).values({
                id: epicId,
                repoId,
                title: epic.title,
                description: epic.description || null,
                status: epic.status || "todo",
                planRevisionId: planRevId,
              }).onConflictDoUpdate({
                target: backlogSchema.epics.id,
                set: {
                  title: epic.title,
                  description: epic.description || null,
                  status: (epic.status as BacklogStatus) || "todo",
                  planRevisionId: planRevId,
                }
              });

              await tx.insert(backlogSchema.phaseEpicsMap).values({
                phaseId: phaseId,
                epicId: epicId,
              }).onConflictDoNothing();
            }
          }
        }
      });

      return c.json({ success: true, message: "Hierarchy synchronized and mapped." });

    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  }
);

export default app;
