/**
 * @file base.ts
 * @description Core project management routes.
 * Handles project listing, creation, and basic overview/codebase metadata.
 * Includes enrichment from Cloudflare Workers/Pages deployments.
 */

import { Hono } from "hono";
import { getDb, repositories } from "@db";
import { and, desc, eq, sql } from "drizzle-orm";
import { 
  fetchProjectContextByOwnerRepo, 
  OVERVIEW_TREE_LIMIT, 
  FILE_RESPONSE_CHAR_LIMIT,
  inferLanguage,
} from "./utils";
import { 
  createOrGetRepositoryForProject, 
  resolveGitHubOwner, 
  syncOwnerRepositoriesIfStale 
} from "@services/repository-sync";
import { getOctokit } from "@/services/octokit/core";
import { getCfSdkClient } from "@/cloudflare/client";

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
 * Lists repos, optionally syncing with GitHub, and enriches with Cloudflare Apps.
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
      id: repositories.id,
      name: repositories.name,
      description: repositories.description,
      status: repositories.lifecycleStage,
      repoId: repositories.id,
      owner: repositories.owner,
      createdAt: repositories.createdAt,
      updatedAt: repositories.updatedAt,
      lastDeployedAt: repositories.updatedAt,
      repoOwner: repositories.owner,
      repoName: repositories.name,
    })
    .from(repositories)
    .orderBy(desc(repositories.updatedAt));

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
      // [REST] const headers = { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" };
      const existingNames = new Set(result.map(r => (r.repoName || r.name || "").toLowerCase()));

      // [REST] const workersRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts`, { headers });
      // [REST] const workersData = await workersRes.json() as any;
      const cfAny = getCfSdkClient(c.env as any, "workerAdmin") as any;
      const workersList = await cfAny.workers.scripts.list({ account_id: accountId });

      if (workersList && Array.isArray(workersList)) {
        for (const w of workersList) {
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

  const repoRec = await db.select().from(repositories).where(and(sql`lower(${repositories.owner}) = lower(${owner})`, sql`lower(${repositories.name}) = lower(${repoName})`)).limit(1);
  if (repoRec[0]) {
    return c.json({ 
      success: true, 
      id: repoRec[0].id,
      name: repoRec[0].name,
      description: repoRec[0].description,
      status: repoRec[0].lifecycleStage || "active",
      owner: repoRec[0].owner,
      projectId: repoRec[0].id, 
      repoId: repoRec[0].id, 
      projectName: repoRec[0].name, 
      projectStatus: repoRec[0].lifecycleStage || "active" 
    });
  }

  return c.json({ success: false, error: "Repository not found." }, 404);
});

/**
 * POST /
 * Creates a new project, optionally creating the supporting GitHub repository.
 */
app.post("/", async (c) => {
  // const db = getDb(c.env.DB);
  const body = await c.req.json() as any;
  const name = body.name?.trim();
  if (!name) return c.json({ success: false, error: "Project name is required" }, 400);

  let repoId = body.repoId?.trim();
  const owner = resolveGitHubOwner(c.env, body.owner);

  if (!repoId) {
    const creation = await createOrGetRepositoryForProject(c.env, { 
      owner, 
      projectName: name, 
      description: body.description,
      infrastructure: body.infraType 
    });
    repoId = creation.repoId;
  }

  // Return the repository as the new project representation
  const newProject = {
    id: repoId,
    repoId,
    name,
    description: body.description || null,
    status: "active",
    owner,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return c.json({ success: true, project: newProject });
});

/**
 * GET /:id/overview
 * Full project overview — assembles project, repository, codebase tree,
 * pending PRs, recent activity, and Cloudflare deployment information.
 * This is the primary data source for the ProjectDashboard frontend component.
 */
app.get("/:owner/:repo/overview", async (c) => {
  const db = getDb(c.env.DB);
  const owner = c.req.param("owner");
  const repo = c.req.param("repo");

  // 1. Resolve project + repository
  const ctx = await fetchProjectContextByOwnerRepo(db, owner, repo);
  if (!ctx || !ctx.repoOwner || !ctx.repoName) {
    return c.json({ success: false, error: "Project not found" }, 404);
  }

  // 2. Codebase tree (GitHub)
  let codebase: { defaultBranch: string; entries: any[] } = { defaultBranch: "main", entries: [] };
  let pendingPrs: any[] = [];
  let recentActivity: any[] = [];
  let cloudflareData: {
    detected: boolean;
    workerName?: string;
    wranglerFile?: string | null;
    bindings?: Record<string, string[] | null>;
    deployments?: Array<{ id: string; createdAt: string; source: string }>;
    dashboardUrl?: string;
  } = { detected: false };

  try {
    const tree = await fetchRepositoryTree(c.env, ctx.repoOwner, ctx.repoName);
    codebase = tree;
  } catch (treeErr) {
    console.error("[overview] Tree fetch failed:", treeErr);
  }

  // 3. Open PRs + Recent activity
  try {
    const octokit = await getOctokit(c.env);

    const [prsRes, eventsRes] = await Promise.allSettled([
      octokit.pulls.list({ owner: ctx.repoOwner, repo: ctx.repoName, state: "open", per_page: 10 }),
      octokit.activity.listRepoEvents({ owner: ctx.repoOwner, repo: ctx.repoName, per_page: 20 }),
    ]);

    if (prsRes.status === "fulfilled") {
      pendingPrs = prsRes.value.data.map((pr: any) => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        draft: pr.draft,
        author: pr.user?.login || "unknown",
        url: pr.html_url,
        updatedAt: pr.updated_at,
      }));
    }

    if (eventsRes.status === "fulfilled") {
      recentActivity = eventsRes.value.data.slice(0, 10).map((event: any) => ({
        id: event.id,
        type: event.type,
        actor: event.actor?.login || "unknown",
        createdAt: event.created_at,
        summary: `${event.type?.replace("Event", "") || "Activity"} by ${event.actor?.login || "unknown"}`,
        url: `https://github.com/${ctx.repoOwner}/${ctx.repoName}`,
        rawPayload: null,
      }));
    }
  } catch (ghErr) {
    console.error("[overview] GitHub fetch failed:", ghErr);
  }

  // 4. Cloudflare Workers deployment info
  try {
    const { getCloudflareApiToken, getCloudflareAccountId } = await import("@utils/secrets");
    const accountId = await getCloudflareAccountId(c.env);
    const apiToken = await getCloudflareApiToken(c.env);

    let wranglerBindings: any = undefined;
    let wranglerFile: string | undefined = undefined;
    let workerName = ctx.repoName;

    try {
      const { detectWranglerConfig, extractWranglerBindings } = await import("./utils");
      const wrangler = await detectWranglerConfig(c.env, ctx.repoOwner, ctx.repoName);
      if (wrangler) {
        wranglerFile = wrangler.fileName;
        wranglerBindings = extractWranglerBindings(wrangler.config || {});
        workerName = wrangler.config?.name || ctx.repoName;
      }
    } catch (e) {
      console.error("[overview] Wrangler parse error:", e);
    }

    if (accountId && apiToken) {
      // workerName is inherited from above
      const headers = { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" };

      const deploymentsRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}/deployments?per_page=15`,
        { headers }
      );
      const deploymentsData = (await deploymentsRes.json()) as any;
      const deployments = (deploymentsData?.result?.items || []).map((d: any) => ({
        id: d.id,
        createdAt: d.created_on,
        source: d.strategy || "deploy",
      }));

      cloudflareData = {
        detected: true,
        workerName,
        wranglerFile,
        bindings: wranglerBindings,
        dashboardUrl: `https://dash.cloudflare.com/${accountId}/workers/view/${workerName}`,
        deployments,
      };
    } else if (wranglerBindings) {
        // If we found a wrangler file, but couldn't verify Cloudflare auth, we still show the bindings
        cloudflareData = {
            detected: true,
            wranglerFile,
            bindings: wranglerBindings
        };
    }
  } catch (cfErr) {
    console.error("[overview] Cloudflare fetch failed:", cfErr);
  }

  // 5. Tags (inferred from repo/project metadata)
  const tags: string[] = [];
  if (codebase.entries.some((e: any) => e.path?.endsWith(".ts") || e.path?.endsWith(".tsx"))) tags.push("TypeScript");
  if (codebase.entries.some((e: any) => e.path === "wrangler.jsonc" || e.path === "wrangler.toml")) tags.push("Cloudflare", "Workers");
  if (codebase.entries.some((e: any) => e.path === "package.json")) tags.push("Node.js");
  if (codebase.entries.some((e: any) => e.path?.endsWith(".py"))) tags.push("Python");
  if (codebase.entries.some((e: any) => e.path?.includes("react") || e.path?.endsWith(".tsx"))) tags.push("React");
  if (codebase.entries.some((e: any) => e.path?.includes("docker") || e.path === "Dockerfile")) tags.push("Docker");

  return c.json({
    success: true,
    project: {
      id: ctx.projectId,
      name: ctx.projectName || ctx.repoName,
      description: ctx.projectDescription || null,
      status: ctx.projectStatus || "active",
      owner: ctx.repoOwner,
      createdAt: ctx.projectCreatedAt || null,
      updatedAt: ctx.projectUpdatedAt || null,
      lastDeployedAt: cloudflareData.deployments?.[0]?.createdAt || null,
    },
    repository: {
      id: ctx.repoId || "",
      owner: ctx.repoOwner,
      name: ctx.repoName,
      fullName: `${ctx.repoOwner}/${ctx.repoName}`,
      url: ctx.repoUrl || `https://github.com/${ctx.repoOwner}/${ctx.repoName}`,
      description: ctx.repoDescription || null,
      infrastructure: ctx.repoInfrastructure || null,
      defaultBranch: codebase.defaultBranch,
    },
    tags: [...new Set(tags)],
    codebase,
    pendingPrs,
    recentActivity,
    cloudflare: cloudflareData,
  });
});

/**
 * GET /:id/codebase/file
 * Fetches a single file's content from the repository tree.
 */
app.get("/:owner/:repo/codebase/file", async (c) => {
  const db = getDb(c.env.DB);
  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const filePath = c.req.query("path") || "";

  const ctx = await fetchProjectContextByOwnerRepo(db, owner, repo);
  if (!ctx || !ctx.repoOwner || !ctx.repoName) {
    return c.json({ success: false, error: "Project not found" }, 404);
  }

  try {
    const octokit = await getOctokit(c.env);
    const res = await octokit.repos.getContent({
      owner: ctx.repoOwner,
      repo: ctx.repoName,
      path: filePath,
    });

    const data = res.data as any;
    if (data.type !== "file") {
      return c.json({ success: false, error: "Not a file" }, 400);
    }

    const raw = atob(data.content.replace(/\n/g, ""));
    const truncated = raw.length > FILE_RESPONSE_CHAR_LIMIT;
    const content = truncated ? raw.slice(0, FILE_RESPONSE_CHAR_LIMIT) : raw;

    return c.json({
      success: true,
      path: filePath,
      language: inferLanguage(filePath),
      truncated,
      content,
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message || "Failed to fetch file" }, 500);
  }
});

/**
 * DELETE /:id
 * Removes a repository entry.
 */
app.delete("/:id", async (c) => {
  const db = getDb(c.env.DB);
  await db.delete(repositories).where(eq(repositories.id, c.req.param("id")));
  return c.json({ success: true });
});

export default app;
