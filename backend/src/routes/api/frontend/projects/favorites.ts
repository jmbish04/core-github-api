/**
 * @file favorites.ts
 * @description Logic for managing project favorites (bookmarks).
 * Includes retrieval, addition, and removal of user-specific favorite mappings.
 */

import { Hono } from "hono";
import { getDb } from "@db";
import { projectFavorites } from "@db/schemas/github/favorites";
import { repositories } from "@db/schemas/github/repos";
import { eq, and, desc } from "drizzle-orm";
import { normalizeControlCenterUserId } from "./utils";

const app = new Hono<{ Bindings: Env }>();


/**
 * GET /favorites
 * Retrieves all active favorites for a specific user, joined with repository metadata.
 */
app.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const userId = normalizeControlCenterUserId(
    c.req.query("userId") || c.req.header("x-user-id"),
  );

  const favorites = await db
    .select({
      userId: projectFavorites.userId,
      projectId: projectFavorites.projectId,
      repoOwner: projectFavorites.repoOwner,
      repoName: projectFavorites.repoName,
      isActive: projectFavorites.isActive,
      timeFavorited: projectFavorites.timeFavorited,
      createdAt: projectFavorites.createdAt,
      repoId: repositories.id,
      projectDescription: repositories.description,
      repoUpdatedAt: repositories.updatedAt,
    })
    .from(projectFavorites)
    .leftJoin(
      repositories,
      and(
        eq(projectFavorites.repoOwner, repositories.owner),
        eq(projectFavorites.repoName, repositories.name),
      ),
    )
    .where(and(eq(projectFavorites.userId, userId), eq(projectFavorites.isActive, true)))
    .orderBy(desc(projectFavorites.timeFavorited));

  return c.json({
    success: true,
    userId,
    favorites,
  });
});

/**
 * POST /favorites
 * Adds or reactivates a project favorite for a user.
 */
app.post("/", async (c) => {
  const db = getDb(c.env.DB);
  const body = (await c.req.json()) as {
    userId?: string;
    projectId?: string;
    repoOwner?: string;
    repoName?: string;
  };

  const userId = normalizeControlCenterUserId(
    body.userId || c.req.header("x-user-id"),
  );
  const repoOwner = String(body.repoOwner || "").trim();
  const repoName = String(body.repoName || "").trim();

  if (!repoOwner || !repoName) {
    return c.json(
      { success: false, error: "repoOwner and repoName are required." },
      400,
    );
  }

  const now = new Date().toISOString();
  await db
    .insert(projectFavorites)
    .values({
      userId,
      projectId: body.projectId || null,
      repoOwner,
      repoName,
      isActive: true,
      timeFavorited: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [projectFavorites.userId, projectFavorites.repoOwner, projectFavorites.repoName],
      set: {
        projectId: body.projectId || null,
        isActive: true,
        timeFavorited: now,
        updatedAt: now,
      },
    });

  return c.json({ success: true, userId, repoOwner, repoName });
});

/**
 * DELETE /favorites/:owner/:repo
 * Deactivates a favorite mapping for a user.
 */
app.delete("/:owner/:repo", async (c) => {
  const db = getDb(c.env.DB);
  const userId = normalizeControlCenterUserId(
    c.req.query("userId") || c.req.header("x-user-id"),
  );
  const repoOwner = String(c.req.param("owner") || "").trim();
  const repoName = String(c.req.param("repo") || "").trim();

  if (!repoOwner || !repoName) {
    return c.json(
      { success: false, error: "owner and repo route params are required." },
      400,
    );
  }

  const now = new Date().toISOString();
  await db
    .update(projectFavorites)
    .set({
      isActive: false,
      timeUnfavorited: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(projectFavorites.userId, userId),
        eq(projectFavorites.repoOwner, repoOwner),
        eq(projectFavorites.repoName, repoName),
      ),
    );

  return c.json({ success: true, userId, repoOwner, repoName });
});

export default app;
