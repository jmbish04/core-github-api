/**
 * @file base.ts
 * @description Core project management routes.
 * Handles project listing, creation, and basic overview/codebase metadata.
 * Includes enrichment from Cloudflare Workers/Pages deployments.
 */

import { Hono } from "hono";
import { getDb, projects, repositories } from "@db";
import { and, desc, eq, sql } from "drizzle-orm";
import { 
  fetchProjectContext, 
  normalizeControlCenterUserId, 
  OVERVIEW_TREE_LIMIT, 
  FILE_RESPONSE_CHAR_LIMIT,
  inferLanguage,
  generateUuid 
} from "./utils";
import { 
  createOrGetRepositoryForProject, 
  ensureProjectForRepository, 
  resolveGitHubOwner, 
  syncOwnerRepositoriesIfStale 
} from "@services/repository-sync";
import { getOctokit } from "@/services/octokit/core";

const app = new Hono<{ Bindings: Env }>();

/**
 * Interface for repository tree entries as returned by GitHub.
 */
type RepoTreeEntry = {
  path: string;
  type: "blob" | "tree";
  size: number;
};

/**
 * Internal helper to fetch the raw repository tree structure.
 */
async function fetchRepositoryTree(
  env: Env,
  owner: string,
  repo: string,
): Promise<{ defaultBranch: string; entries: RepoTreeEntry[] }> {
  const octokit = await getOctokit(env);
  const repoResponse = await octokit.repos.get({ owner, repo });
  const defaultBranch = repoResponse.data.default_branch || "main";

  const treeResponse = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: defaultBranch,
    recursive: "1",
  } as any);

  const entries = ((treeResponse.data as any).tree || [])
    .filter((entry: any) => entry?.path && (entry?.type === "blob" || entry?.type === "tree"))
    .map(
      (entry: any): RepoTreeEntry => ({
        path: String(entry.path),
        type: entry.type === "tree" ? "tree" : "blob",
        size: Number(entry.size || 0),
      }),
    )
    .sort((a: RepoTreeEntry, b: RepoTreeEntry) => a.path.localeCompare(b.path))
    .slice(0, OVERVIEW_TREE_LIMIT);

  return { defaultBranch, entries };
}

/**
 * GET /
 * Lists projects, optionally syncing with GitHub, and enriches with Cloudflare Apps.
 */
app.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const owner = resolveGitHubOwner(c.env, c.req.query("owner"));
  const forceSync = ["1", "true", "yes"].includes((c.req.query("sync") || "").toLowerCase());

  c.executionCtx.waitUntil(
    syncOwnerRepositoriesIfStale(c.env, owner, {
      force: forceSync,
      ensureProjects: true,
      minIntervalMs: 2 * 60 * 1000,
    }).catch(err => console.error("[projects] Repository sync error:", err))
  );

  const rawResult = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      status: projects.status,
      repoId: projects.repoId,
      owner: projects.owner,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      lastDeployedAt: repositories.updatedAt,
      repoOwner: repositories.owner,
      repoName: repositories.name,
    })
    .from(projects)
    .leftJoin(repositories, eq(projects.repoId, repositories.id))
    .orderBy(desc(repositories.updatedAt), desc(projects.updatedAt));

  const seen = new Map<string, any>();
  for (const row of rawResult) {
    const key = row.repoId || row.id;
    if (!seen.has(key)) seen.set(key, row);
  }
  const result = Array.from(seen.values());

  // Cloudflare Enrichment
  const cfApps: any[] = [];
  try {
    const { getCloudflareApiToken, getCloudflareAccountId } = await import("@utils/secrets");
    const accountId = await getCloudflareAccountId(c.env);
    const apiToken = await getCloudflareApiToken(c.env);

    if (accountId && apiToken) {
      const headers = { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" };
      const existingNames = new Set(result.map(r => (r.repoName || r.name || "").toLowerCase()));

      const workersRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts`, { headers });
      const workersData = await workersRes.json() as any;
      if (workersData?.success && Array.isArray(workersData.result)) {
        for (const w of workersData.result) {
          if (existingNames.has(String(w.id || "").toLowerCase())) continue;
          cfApps.push({
            id: `cf-worker-${w.id}`,
            name: w.id,
            description: "Cloudflare Worker",
            status: "active",
            repoId: null,
            owner: owner || null,
            createdAt: w.created_on,
            updatedAt: w.modified_on,
            lastDeployedAt: w.modified_on,
            repoOwner: null,
            repoName: w.id
          });
        }
      }
    }
  } catch (err) {
    console.error("[projects] CF enrichment failed:", err);
  }

  return c.json({ success: true, projects: [...result, ...cfApps] });
});

/**
 * GET /by-repo/:owner/:repo
 * Resolves a project ID given a repository full name.
 */
app.get("/by-repo/:owner/:repo", async (c) => {
  const db = getDb(c.env.DB);
  const owner = c.req.param("owner");
  const repoName = c.req.param("repo");

  const find = async () => db.select().from(projects).leftJoin(repositories, eq(projects.repoId, repositories.id))
    .where(and(sql`lower(${repositories.owner}) = lower(${owner})`, sql`lower(${repositories.name}) = lower(${repoName})`))
    .orderBy(desc(projects.updatedAt)).limit(1);

  let match = await find();
  if (match[0]) return c.json({ success: true, ...match[0].projects, repoId: match[0].repositories?.id });

  const repoRec = await db.select().from(repositories).where(and(sql`lower(${repositories.owner}) = lower(${owner})`, sql`lower(${repositories.name}) = lower(${repoName})`)).limit(1);
  if (repoRec[0]) {
    const ensured = await ensureProjectForRepository(c.env, repoRec[0].id, { name: repoRec[0].name, owner: repoRec[0].owner, status: "active" });
    return c.json({ success: true, projectId: ensured.projectId, repoId: repoRec[0].id, projectName: repoRec[0].name, projectStatus: "active" });
  }

  return c.json({ success: false, error: "Repository not found." }, 404);
});

/**
 * POST /
 * Creates a new project, optionally creating the supporting GitHub repository.
 */
app.post("/", async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json() as any;
  const name = body.name?.trim();
  if (!name) return c.json({ success: false, error: "Project name is required" }, 400);

  let repoId = body.repoId?.trim();
  let owner = resolveGitHubOwner(c.env, body.owner);

  if (!repoId) {
    const creation = await createOrGetRepositoryForProject(c.env, { 
      owner, 
      projectName: name, 
      description: body.description,
      infrastructure: body.infraType 
    });
    repoId = creation.repoId;
  }

  const newProject = {
    id: generateUuid(),
    repoId,
    name,
    description: body.description || null,
    status: "planning",
    owner,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await db.insert(projects).values(newProject).onConflictDoNothing();
  return c.json({ success: true, project: newProject });
});

/**
 * DELETE /:id
 * Removes a project entry.
 */
app.delete("/:id", async (c) => {
  const db = getDb(c.env.DB);
  await db.delete(projects).where(eq(projects.id, c.req.param("id")));
  return c.json({ success: true });
});

export default app;
