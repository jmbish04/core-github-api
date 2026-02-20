import { Hono } from "hono";
import { Agent as OpenAIAgent } from "@openai/agents";
import TOML from "@iarna/toml";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@db";
import { projects, projectPhases } from "../../db/schemas/projects/roadmap";
import { tasks } from "../../db/schemas/projects/tasks";
import { projectPlans } from "../../db/schemas/projects/plans";
import { projectFavorites } from "../../db/schemas/github/favorites";
import { userSettings } from "../../db/schemas/app/settings";
import { repoTags, repositories } from "../../db/schemas/github/repos";
import {
  createRunner,
  resolveDefaultAiModel,
  resolveDefaultAiProvider,
  runTextAgent,
} from "@/ai/agent-ai";
import { CodeGeneratorAgent } from "@/ai/agents/SoftwareEngineer";
import { getOctokit } from "@/services/octokit/core";
import {
  createOrGetRepositoryForProject,
  ensureProjectForRepository,
  resolveGitHubOwner,
  syncOwnerRepositoriesIfStale,
} from "@services/repository-sync";
import { KanbanColumn, TaskStatus } from "@/types/enums";
import { buildGoldenPathInstructions } from "@/standards/goldenPath";

const projectsApi = new Hono<{ Bindings: Env }>();

const OVERVIEW_TREE_LIMIT = 1500;
const FILE_RESPONSE_CHAR_LIMIT = 120_000;
const DEFAULT_CONTROL_CENTER_USER = "default-user";

const AssistantPlanSchema = z.object({
  epics: z
    .array(
      z.object({
        title: z.string(),
        description: z.string().optional(),
        userStories: z
          .array(
            z.object({
              title: z.string(),
              description: z.string().optional(),
              tasks: z.array(z.string()).default([]),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});

const AssistantResponseSchema = z.object({
  reply: z.string(),
  assignJulesTask: z.string().optional(),
  prd: z.string().optional(),
  plan: AssistantPlanSchema.optional(),
});

type ProjectContext = {
  projectId: string;
  projectName: string;
  projectDescription: string | null;
  projectStatus: string | null;
  projectCreatedAt: string | null;
  projectUpdatedAt: string | null;
  projectOwner: string | null;
  repoId: string;
  repoOwner: string | null;
  repoName: string | null;
  repoUrl: string | null;
  repoDescription: string | null;
  repoInfrastructure: string | null;
  repoUpdatedAt: string | null;
};

type RepoTreeEntry = {
  path: string;
  type: "blob" | "tree";
  size: number;
};

type EffectiveAgentSettings = {
  userId: string;
  preferredProvider: string;
  preferredModel: string;
  enforceGoldenPath: boolean;
  customInstructions: string;
};

function normalizeControlCenterUserId(input?: string | null): string {
  const normalized = String(input || "").trim();
  return normalized || DEFAULT_CONTROL_CENTER_USER;
}

async function ensureProjectFavoritesTable(env: Env): Promise<void> {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS project_favorites (
      user_id TEXT NOT NULL,
      repo_owner TEXT NOT NULL,
      repo_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, repo_owner, repo_name)
    )`,
  ).run();

  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_project_favorites_user ON project_favorites(user_id)",
  ).run();
}

async function resolveEffectiveAgentSettings(
  db: ReturnType<typeof getDb>,
  userIdInput?: string | null,
): Promise<EffectiveAgentSettings> {
  const userId = normalizeControlCenterUserId(userIdInput);
  const existing = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!existing) {
    return {
      userId,
      preferredProvider: "worker-ai",
      preferredModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      enforceGoldenPath: true,
      customInstructions: "",
    };
  }

  return {
    userId,
    preferredProvider: existing.preferredProvider || "worker-ai",
    preferredModel:
      existing.preferredModel || "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    enforceGoldenPath: Boolean(existing.enforceGoldenPath),
    customInstructions: existing.customInstructions || "",
  };
}

function parseJsonc(raw: string): any {
  const withoutComments = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  return JSON.parse(withoutComments);
}

function inferProjectTags(paths: string[], infrastructure?: string | null): string[] {
  const tags = new Set<string>();
  const lowerPaths = paths.map((path) => path.toLowerCase());
  const infra = (infrastructure || "").toLowerCase();

  if (lowerPaths.some((path) => path.endsWith(".py"))) tags.add("Python");
  if (lowerPaths.some((path) => path.endsWith(".ts") || path.endsWith(".tsx"))) tags.add("TypeScript");
  if (lowerPaths.some((path) => path.endsWith(".js") || path.endsWith(".jsx"))) tags.add("JavaScript");
  if (lowerPaths.some((path) => path.endsWith(".astro") || path.includes("astro.config"))) tags.add("Astro");
  if (lowerPaths.some((path) => path.includes("react"))) tags.add("React");
  if (lowerPaths.some((path) => path.endsWith("dockerfile") || path.endsWith(".dockerfile"))) tags.add("Docker");
  if (lowerPaths.some((path) => path.endsWith("wrangler.toml") || path.endsWith("wrangler.json") || path.endsWith("wrangler.jsonc"))) {
    tags.add("Workers");
    tags.add("Cloudflare");
  }
  if (lowerPaths.some((path) => path.endsWith("package.json"))) tags.add("Node.js");
  if (lowerPaths.some((path) => path.includes("drizzle") || path.includes("migrations"))) tags.add("Drizzle");
  if (lowerPaths.some((path) => path.includes(".github/workflows"))) tags.add("GitHub Actions");
  if (infra.includes("worker")) {
    tags.add("Workers");
    tags.add("Cloudflare");
  }
  if (infra.includes("pages")) {
    tags.add("Cloudflare");
    tags.add("Pages");
  }

  if (tags.size === 0) {
    tags.add("Repository");
  }

  return Array.from(tags).sort((a, b) => a.localeCompare(b));
}

function inferLanguage(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".ts")) return "typescript";
  if (lower.endsWith(".tsx")) return "tsx";
  if (lower.endsWith(".js")) return "javascript";
  if (lower.endsWith(".jsx")) return "jsx";
  if (lower.endsWith(".json") || lower.endsWith(".jsonc")) return "json";
  if (lower.endsWith(".md")) return "markdown";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".yml") || lower.endsWith(".yaml")) return "yaml";
  if (lower.endsWith(".toml")) return "toml";
  if (lower.endsWith(".py")) return "python";
  if (lower.endsWith(".sql")) return "sql";
  return "text";
}

function pickSummaryFiles(paths: string[]): string[] {
  const preferred = [
    "README.md",
    "readme.md",
    "wrangler.jsonc",
    "wrangler.toml",
    "wrangler.json",
    "package.json",
    "backend/src/index.ts",
    "src/index.ts",
  ];

  const picked = new Set<string>();
  for (const candidate of preferred) {
    const match = paths.find((path) => path.toLowerCase() === candidate.toLowerCase());
    if (match) picked.add(match);
  }

  const fallback = paths
    .filter((path) =>
      [".ts", ".tsx", ".js", ".jsx", ".py", ".md"].some((ext) => path.toLowerCase().endsWith(ext)),
    )
    .slice(0, 12);

  for (const path of fallback) picked.add(path);
  return Array.from(picked).slice(0, 12);
}

function extractWranglerBindings(config: any) {
  const toNames = (entries: any[] | undefined, keys: string[]) =>
    (entries || [])
      .map((entry) => {
        for (const key of keys) {
          if (entry && typeof entry[key] === "string" && entry[key]) return entry[key];
        }
        return null;
      })
      .filter((value): value is string => Boolean(value));

  const queueNames = [
    ...toNames(config?.queues?.producers, ["binding", "queue"]),
    ...toNames(config?.queues?.consumers, ["queue", "binding"]),
  ];

  const aiBinding =
    typeof config?.ai?.binding === "string" ? config.ai.binding : null;

  return {
    kv: toNames(config?.kv_namespaces, ["binding", "name"]),
    d1: toNames(config?.d1_databases, ["binding", "database_name"]),
    durableObjects: toNames(config?.durable_objects?.bindings, ["name", "binding"]),
    r2: toNames(config?.r2_buckets, ["binding", "bucket_name"]),
    queues: queueNames,
    services: toNames(config?.services, ["binding", "service"]),
    workflows: toNames(config?.workflows, ["binding", "name"]),
    ai: aiBinding ? [aiBinding] : [],
  };
}

async function fetchProjectContext(
  db: ReturnType<typeof getDb>,
  projectId: string,
): Promise<ProjectContext | null> {
  const rows = await db
    .select({
      projectId: projects.id,
      projectName: projects.name,
      projectDescription: projects.description,
      projectStatus: projects.status,
      projectCreatedAt: projects.createdAt,
      projectUpdatedAt: projects.updatedAt,
      projectOwner: projects.owner,
      repoId: projects.repoId,
      repoOwner: repositories.owner,
      repoName: repositories.name,
      repoUrl: repositories.repoUrl,
      repoDescription: repositories.description,
      repoInfrastructure: repositories.infrastructure,
      repoUpdatedAt: repositories.updatedAt,
    })
    .from(projects)
    .leftJoin(repositories, eq(projects.repoId, repositories.id))
    .where(eq(projects.id, projectId))
    .limit(1);

  return rows[0] || null;
}

async function syncRepositoryTags(
  db: ReturnType<typeof getDb>,
  repoId: string,
  tags: string[],
): Promise<string[]> {
  const normalized = Array.from(new Set(tags)).sort((a, b) => a.localeCompare(b));
  const existing = await db
    .select({ tag: repoTags.tag })
    .from(repoTags)
    .where(eq(repoTags.repoId, repoId));

  const existingTags = new Set(existing.map((row) => row.tag));
  const tagsToAdd = normalized.filter((tag) => !existingTags.has(tag));
  const tagsToRemove = Array.from(existingTags).filter((tag) => !normalized.includes(tag));

  if (tagsToAdd.length > 0) {
    await db
      .insert(repoTags)
      .values(tagsToAdd.map((tag) => ({ repoId, tag })))
      .onConflictDoNothing();
  }

  if (tagsToRemove.length > 0) {
    await db
      .delete(repoTags)
      .where(and(eq(repoTags.repoId, repoId), inArray(repoTags.tag, tagsToRemove)));
  }

  return normalized;
}

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

async function fetchRepositoryFileText(
  env: Env,
  owner: string,
  repo: string,
  path: string,
  ref?: string,
): Promise<string | null> {
  try {
    const octokit = await getOctokit(env);
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ...(ref ? { ref } : {}),
    } as any);
    const data = response.data as any;

    if (Array.isArray(data)) return null;
    if (data.type !== "file" || !data.content) return null;

    const content = Buffer.from(data.content, "base64").toString("utf8");
    return content;
  } catch {
    return null;
  }
}

async function fetchPendingPullRequests(
  env: Env,
  owner: string,
  repo: string,
): Promise<
  Array<{
    number: number;
    title: string;
    state: string;
    draft: boolean;
    author: string;
    url: string;
    updatedAt: string;
  }>
> {
  try {
    const octokit = await getOctokit(env);
    const response = await octokit.pulls.list({
      owner,
      repo,
      state: "open",
      per_page: 20,
      sort: "updated",
      direction: "desc",
    });

    return response.data.map((pr) => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      draft: Boolean(pr.draft),
      author: pr.user?.login || "unknown",
      url: pr.html_url,
      updatedAt: pr.updated_at,
    }));
  } catch (error) {
    console.error("[projects] Failed to fetch pending PRs:", error);
    return [];
  }
}

async function fetchRecentRepositoryActivity(
  env: Env,
  owner: string,
  repo: string,
): Promise<
  Array<{
    id: string;
    type: string;
    actor: string;
    createdAt: string;
    summary: string;
    url: string;
  }>
> {
  try {
    const octokit = await getOctokit(env);
    const response = await octokit.activity.listRepoEvents({
      owner,
      repo,
      per_page: 20,
    });

    return response.data.map((event: any) => {
      const action = event?.payload?.action ? ` (${event.payload.action})` : "";
      return {
        id: String(event.id || crypto.randomUUID()),
        type: String(event.type || "Event"),
        actor: String(event.actor?.login || "unknown"),
        createdAt: String(event.created_at || new Date().toISOString()),
        summary: `${event.type || "Event"}${action}`,
        url: `https://github.com/${owner}/${repo}`,
      };
    });
  } catch (error) {
    console.error("[projects] Failed to fetch repository activity:", error);
    return [];
  }
}

async function detectWranglerConfig(
  env: Env,
  owner: string,
  repo: string,
  ref?: string,
): Promise<{ fileName: string; config: any } | null> {
  const candidates = ["wrangler.jsonc", "wrangler.toml", "wrangler.json"];

  for (const fileName of candidates) {
    const text = await fetchRepositoryFileText(env, owner, repo, fileName, ref);
    if (!text) continue;

    try {
      if (fileName.endsWith(".toml")) {
        return { fileName, config: TOML.parse(text) };
      }
      return { fileName, config: parseJsonc(text) };
    } catch (error) {
      console.error(`[projects] Failed to parse ${fileName}:`, error);
    }
  }

  return null;
}

async function fetchCloudflareDeployments(
  env: Env,
  workerName: string,
): Promise<Array<{ id: string; createdAt: string; source: string }>> {
  const accountId = await env.CLOUDFLARE_ACCOUNT_ID.get();
  const apiToken = await env.CLOUDFLARE_API_TOKEN.get();

  if (!accountId || !apiToken || !workerName) {
    return [];
  }

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}/deployments`,
      {
        headers: {
          authorization: `Bearer ${apiToken}`,
          "content-type": "application/json",
        },
      },
    );

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as any;
    const deployments = Array.isArray(data?.result) ? data.result : [];
    return deployments.slice(0, 10).map((deployment: any) => ({
      id: String(
        deployment?.id ||
          deployment?.deployment_id ||
          deployment?.version_id ||
          crypto.randomUUID(),
      ),
      createdAt: String(
        deployment?.created_on ||
          deployment?.created_at ||
          deployment?.source?.upload_time ||
          new Date().toISOString(),
      ),
      source: String(deployment?.source || deployment?.annotations?.trigger || "unknown"),
    }));
  } catch (error) {
    console.error("[projects] Failed to fetch Cloudflare deployments:", error);
    return [];
  }
}

async function savePlanToProjectTables(
  db: ReturnType<typeof getDb>,
  projectId: string,
  repoId: string,
  plan: z.infer<typeof AssistantPlanSchema>,
) {
  let epicsCreated = 0;
  let userStoriesCreated = 0;
  let tasksCreated = 0;
  const now = new Date().toISOString();

  // Replace prior generated hierarchy for deterministic plan refreshes.
  await db.delete(projectPlans).where(eq(projectPlans.projectId, projectId));

  for (const epic of plan.epics) {
    const phaseId = crypto.randomUUID();
    const epicPlanId = crypto.randomUUID();

    await db.insert(projectPhases).values({
      id: phaseId,
      projectId,
      name: epic.title,
      description: epic.description || null,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(projectPlans).values({
      id: epicPlanId,
      projectId,
      parentId: null,
      itemType: "epic",
      title: epic.title,
      description: epic.description || null,
      status: "todo",
      priority: "medium",
      orderIndex: epicsCreated,
      metadataJson: JSON.stringify({
        source: "assistant",
      }),
      createdAt: now,
      updatedAt: now,
    });
    epicsCreated += 1;

    for (const [storyIndex, story] of epic.userStories.entries()) {
      const storyTaskId = crypto.randomUUID();
      const storyPlanId = crypto.randomUUID();
      await db.insert(tasks).values({
        id: storyTaskId,
        repoId,
        title: `[Story] ${story.title}`,
        description: story.description || null,
        status: TaskStatus.BACKLOG,
        kanbanColumn: KanbanColumn.BACKLOG,
        priority: "medium",
        phaseId,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(projectPlans).values({
        id: storyPlanId,
        projectId,
        parentId: epicPlanId,
        itemType: "story",
        title: story.title,
        description: story.description || null,
        status: "todo",
        priority: "medium",
        orderIndex: storyIndex,
        metadataJson: JSON.stringify({
          phaseId,
          source: "assistant",
        }),
        createdAt: now,
        updatedAt: now,
      });
      userStoriesCreated += 1;

      for (const [taskIndex, taskTitle] of story.tasks.entries()) {
        await db.insert(tasks).values({
          id: crypto.randomUUID(),
          repoId,
          title: taskTitle,
          description: `User story: ${story.title}`,
          status: TaskStatus.BACKLOG,
          kanbanColumn: KanbanColumn.BACKLOG,
          priority: "medium",
          phaseId,
          initiative: story.title,
          createdAt: now,
          updatedAt: now,
        });
        await db.insert(projectPlans).values({
          id: crypto.randomUUID(),
          projectId,
          parentId: storyPlanId,
          itemType: "task",
          title: taskTitle,
          description: `User story: ${story.title}`,
          status: "todo",
          priority: "medium",
          orderIndex: taskIndex,
          metadataJson: JSON.stringify({
            phaseId,
            story: story.title,
            source: "assistant",
          }),
          createdAt: now,
          updatedAt: now,
        });
        tasksCreated += 1;
      }
    }
  }

  return { epicsCreated, userStoriesCreated, tasksCreated };
}

import { JulesService } from "@services/jules";

async function dispatchTaskToJules(
  env: Env,
  payload: {
    projectId: string;
    projectName: string;
    repoFullName: string;
    prompt: string;
  },
): Promise<{ dispatched: boolean; message: string; sessionId?: string }> {
  try {
    const julesService = JulesService.getInstance(env);
    
    // Parse repo owner/name
    let repo: { owner: string; repo: string } | undefined;
    if (payload.repoFullName) {
      const parts = payload.repoFullName.split('/');
      if (parts.length === 2) {
        repo = { owner: parts[0], repo: parts[1] };
      }
    }

    const session = await julesService.startSession({
      prompt: payload.prompt,
      repo,
      autoPr: false // Default to false for safe handoff
    });

    return {
      dispatched: true,
      message: `Task dispatched to Jules successfully. Session ID: ${session.id}`,
      sessionId: session.id
    };
  } catch (error: any) {
    console.error("[projects] Failed to dispatch task to Jules:", error);
    return {
      dispatched: false,
      message: error?.message || "Failed to dispatch task to Jules.",
    };
  }
}

async function getRepositoryBackedProjects(d1: D1Database) {
  const tableInfo = await d1.prepare("PRAGMA table_info(repositories)").all();
  const columns = new Set(
    ((tableInfo.results || []) as Array<{ name?: string }>)
      .map((row) => String(row.name || ""))
      .filter(Boolean),
  );

  if (!columns.has("id") || !columns.has("name") || !columns.has("owner")) {
    return [];
  }

  const selectColumns = ["id", "name", "owner"];
  if (columns.has("description")) selectColumns.push("description");
  if (columns.has("created_at")) selectColumns.push("created_at");
  if (columns.has("updated_at")) selectColumns.push("updated_at");
  if (columns.has("repo_url")) selectColumns.push("repo_url");

  const orderColumn = columns.has("updated_at") ? "updated_at" : "id";
  const result = await d1
    .prepare(`SELECT ${selectColumns.join(", ")} FROM repositories ORDER BY ${orderColumn} DESC`)
    .all();

  const rows = (result.results || []) as Array<Record<string, unknown>>;
  return rows.map((repo) => {
    const id = String(repo.id || "");
    const name = String(repo.name || id);
    const owner = String(repo.owner || "");
    const createdAt = String(repo.created_at || new Date().toISOString());
    const updatedAt = String(repo.updated_at || createdAt);

    return {
      id,
      name,
      description: (repo.description as string | null) || null,
      status: "active",
      repoId: id,
      owner,
      createdAt,
      updatedAt,
      lastDeployedAt: updatedAt,
      repoOwner: owner,
      repoName: name,
    };
  });
}

// --- Projects ---

projectsApi.get("/favorites", async (c) => {
  await ensureProjectFavoritesTable(c.env);
  const db = getDb(c.env.DB);
  const userId = normalizeControlCenterUserId(
    c.req.query("userId") || c.req.header("x-user-id"),
  );

  const favorites = await db
    .select({
      userId: projectFavorites.userId,
      repoOwner: projectFavorites.repoOwner,
      repoName: projectFavorites.repoName,
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
    .where(eq(projectFavorites.userId, userId))
    .orderBy(desc(projectFavorites.createdAt));

  return c.json({
    success: true,
    userId,
    favorites,
  });
});

projectsApi.post("/favorites", async (c) => {
  await ensureProjectFavoritesTable(c.env);
  const db = getDb(c.env.DB);
  const body = (await c.req.json()) as {
    userId?: string;
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

  await db
    .insert(projectFavorites)
    .values({
      userId,
      repoOwner,
      repoName,
      createdAt: new Date().toISOString(),
    })
    .onConflictDoNothing();

  return c.json({ success: true, userId, repoOwner, repoName });
});

projectsApi.delete("/favorites/:owner/:repo", async (c) => {
  await ensureProjectFavoritesTable(c.env);
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

  await db
    .delete(projectFavorites)
    .where(
      and(
        eq(projectFavorites.userId, userId),
        eq(projectFavorites.repoOwner, repoOwner),
        eq(projectFavorites.repoName, repoName),
      ),
    );

  return c.json({ success: true, userId, repoOwner, repoName });
});

projectsApi.get("/by-repo/:owner/:repo", async (c) => {
  const db = getDb(c.env.DB);
  const owner = c.req.param("owner");
  const repoName = c.req.param("repo");

  const findProjectByRepo = async () =>
    db
      .select({
        projectId: projects.id,
        repoId: repositories.id,
        projectName: projects.name,
        projectStatus: projects.status,
        repoOwner: repositories.owner,
        repoName: repositories.name,
      })
      .from(projects)
      .leftJoin(repositories, eq(projects.repoId, repositories.id))
      .where(
        and(
          sql`lower(${repositories.owner}) = lower(${owner})`,
          sql`lower(${repositories.name}) = lower(${repoName})`,
        ),
      )
      .orderBy(desc(projects.updatedAt))
      .limit(1);

  let match = await findProjectByRepo();
  if (match[0]) {
    return c.json({ success: true, ...match[0] });
  }

  const repositoryRecord = await db
    .select({
      id: repositories.id,
      owner: repositories.owner,
      name: repositories.name,
      description: repositories.description,
    })
    .from(repositories)
    .where(
      and(
        sql`lower(${repositories.owner}) = lower(${owner})`,
        sql`lower(${repositories.name}) = lower(${repoName})`,
      ),
    )
    .limit(1);

  if (repositoryRecord[0]) {
    const ensured = await ensureProjectForRepository(c.env, repositoryRecord[0].id, {
      name: repositoryRecord[0].name,
      description: repositoryRecord[0].description || null,
      owner: repositoryRecord[0].owner,
      status: "active",
    });

    return c.json({
      success: true,
      projectId: ensured.projectId,
      repoId: repositoryRecord[0].id,
      projectName: repositoryRecord[0].name,
      projectStatus: "active",
      repoOwner: repositoryRecord[0].owner,
      repoName: repositoryRecord[0].name,
    });
  }

  try {
    await syncOwnerRepositoriesIfStale(c.env, owner, {
      force: true,
      ensureProjects: true,
      minIntervalMs: 0,
    });
  } catch (error) {
    console.error("[projects] by-repo sync failed:", error);
  }

  match = await findProjectByRepo();
  if (match[0]) {
    return c.json({ success: true, ...match[0] });
  }

  return c.json(
    { success: false, error: `Repository ${owner}/${repoName} not found.` },
    404,
  );
});

projectsApi.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const owner = resolveGitHubOwner(c.env, c.req.query("owner"));
  const forceSync = ["1", "true", "yes"].includes(
    (c.req.query("sync") || "").toLowerCase(),
  );

  c.executionCtx.waitUntil(
    syncOwnerRepositoriesIfStale(c.env, owner, {
      force: forceSync,
      ensureProjects: true,
      minIntervalMs: 2 * 60 * 1000,
    }).catch((error) => {
      console.error("[projects] Failed to sync owner repositories:", error);
    }),
  );

  const sync = {
    queued: true,
    owner,
    forced: forceSync,
  };

  try {
    const result = await db
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

    return c.json({ success: true, projects: result, sync });
  } catch (error) {
    console.error("[projects] Falling back to repository-backed listing:", error);
    let fallbackProjects: Awaited<ReturnType<typeof getRepositoryBackedProjects>> = [];
    try {
      fallbackProjects = await getRepositoryBackedProjects(c.env.DB);
    } catch (fallbackError) {
      console.error("[projects] Repository-backed fallback failed:", fallbackError);
    }
    return c.json({
      success: true,
      projects: fallbackProjects,
      sync,
      warning:
        "Returning repository-backed project list due to projects table read error.",
    });
  }
});

projectsApi.post("/", async (c) => {
  const db = getDb(c.env.DB);
  const body = (await c.req.json()) as {
    repoId?: string;
    repoName?: string;
    name?: string;
    description?: string;
    visibility?: "public" | "private" | "internal";
    infraType?: string;
    owner?: string;
  };

  const name = body.name?.trim();
  if (!name) {
    return c.json({ success: false, error: "Project name is required" }, 400);
  }

  let repoId = body.repoId?.trim();
  let githubRepoCreated = false;
  let owner = resolveGitHubOwner(c.env, body.owner);
  let repoName = body.repoName?.trim();

  try {
    if (!repoId) {
      const repoCreation = await createOrGetRepositoryForProject(c.env, {
        owner,
        projectName: name,
        repoName,
        description: body.description,
        visibility: body.visibility,
        infrastructure: body.infraType || null,
      });

      repoId = repoCreation.repoId;
      owner = repoCreation.owner;
      repoName = repoCreation.repoName;
      githubRepoCreated = repoCreation.githubRepoCreated;
    }
  } catch (error: any) {
    const message =
      error?.message || "Failed to create or fetch GitHub repository";
    return c.json({ success: false, error: message }, 502);
  }

  if (!repoId) {
    return c.json({ success: false, error: "Missing repository ID" }, 400);
  }

  const repo = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, repoId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!repo) {
    return c.json(
      { success: false, error: `Repository ${repoId} not found in D1` },
      400,
    );
  }

  try {
    const existingProject = await db
      .select()
      .from(projects)
      .where(eq(projects.repoId, repoId))
      .limit(1)
      .then((rows) => rows[0]);

    if (existingProject) {
      return c.json({
        success: true,
        project: existingProject,
        deduped: true,
        githubRepoCreated,
        repository: {
          id: repo.id,
          owner: repo.owner,
          name: repo.name,
          url: repo.repoUrl,
        },
      });
    }

    const now = new Date().toISOString();
    const newProject = {
      id: crypto.randomUUID(),
      repoId,
      name,
      description: body.description || null,
      status: "planning",
      owner,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(projects).values(newProject);
    return c.json({
      success: true,
      project: newProject,
      deduped: false,
      githubRepoCreated,
      repository: {
        id: repo.id,
        owner: repo.owner,
        name: repo.name,
        url: repo.repoUrl,
      },
    });
  } catch (error: any) {
    console.error(
      "[projects] Failed to persist project row; repository was still synced.",
      error,
    );
    return c.json({
      success: true,
      project: {
        id: repo.id,
        repoId: repo.id,
        name,
        description: body.description || null,
        status: "planning",
        owner,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      deduped: false,
      githubRepoCreated,
      repository: {
        id: repo.id,
        owner: repo.owner,
        name: repo.name,
        url: repo.repoUrl,
      },
      warning: "Repository created/synced, but projects table write failed.",
    });
  }
});

projectsApi.get("/:id/overview", async (c) => {
  const db = getDb(c.env.DB);
  const projectId = c.req.param("id");
  const context = await fetchProjectContext(db, projectId);

  if (!context) {
    return c.json({ success: false, error: "Project not found" }, 404);
  }

  if (!context.repoOwner || !context.repoName) {
    return c.json(
      { success: false, error: "Project repository context is incomplete." },
      400,
    );
  }

  let defaultBranch = "main";
  let treeEntries: RepoTreeEntry[] = [];
  try {
    const tree = await fetchRepositoryTree(c.env, context.repoOwner, context.repoName);
    defaultBranch = tree.defaultBranch;
    treeEntries = tree.entries;
  } catch (error) {
    console.error("[projects] Failed to fetch repository tree:", error);
  }

  const tags = inferProjectTags(
    treeEntries.filter((entry) => entry.type === "blob").map((entry) => entry.path),
    context.repoInfrastructure,
  );
  let persistedTags = tags;
  try {
    persistedTags = await syncRepositoryTags(db, context.repoId, tags);
  } catch (error) {
    console.error("[projects] Failed to sync repository tags:", error);
  }

  const pendingPrs = await fetchPendingPullRequests(
    c.env,
    context.repoOwner,
    context.repoName,
  );
  const recentActivity = await fetchRecentRepositoryActivity(
    c.env,
    context.repoOwner,
    context.repoName,
  );
  // await syncOwnerRepositoriesIfStale(
  //   c.env,
  //   context.repoOwner,
  //   context.repoName,
  // );

  const wrangler = await detectWranglerConfig(
    c.env,
    context.repoOwner,
    context.repoName,
    defaultBranch,
  );

  const cloudflareDetected =
    persistedTags.includes("Workers") || Boolean(wrangler?.config);
  const workerName =
    String((wrangler?.config as any)?.name || "").trim() ||
    (c.env as any).CLOUDFLARE_WORKER_NAME ||
    context.repoName;
  const deployments = cloudflareDetected
    ? await fetchCloudflareDeployments(c.env, workerName)
    : [];

  return c.json({
    success: true,
    project: {
      id: context.projectId,
      name: context.projectName,
      description: context.projectDescription,
      status: context.projectStatus || "planning",
      owner: context.projectOwner,
      createdAt: context.projectCreatedAt,
      updatedAt: context.projectUpdatedAt,
      lastDeployedAt: context.repoUpdatedAt || context.projectUpdatedAt,
    },
    repository: {
      id: context.repoId,
      owner: context.repoOwner,
      name: context.repoName,
      fullName: `${context.repoOwner}/${context.repoName}`,
      url: context.repoUrl,
      description: context.repoDescription,
      infrastructure: context.repoInfrastructure,
      defaultBranch,
    },
    tags: persistedTags,
    codebase: {
      defaultBranch,
      entries: treeEntries,
    },
    pendingPrs,
    recentActivity,
    cloudflare: cloudflareDetected
      ? {
          detected: true,
          workerName,
          wranglerFile: wrangler?.fileName || null,
          bindings: wrangler?.config ? extractWranglerBindings(wrangler.config) : null,
          deployments,
          dashboardUrl: `https://dash.cloudflare.com/?to=/:account/workers/services/view/${workerName}/production`,
        }
      : {
          detected: false,
        },
  });
});

projectsApi.get("/:id/codebase/file", async (c) => {
  const db = getDb(c.env.DB);
  const projectId = c.req.param("id");
  const filePath = (c.req.query("path") || "").trim();
  const ref = (c.req.query("ref") || "").trim() || undefined;

  if (!filePath) {
    return c.json({ success: false, error: "Query parameter `path` is required." }, 400);
  }
  if (filePath.includes("..")) {
    return c.json({ success: false, error: "Invalid file path." }, 400);
  }

  const context = await fetchProjectContext(db, projectId);
  if (!context || !context.repoOwner || !context.repoName) {
    return c.json({ success: false, error: "Project not found" }, 404);
  }

  const content = await fetchRepositoryFileText(
    c.env,
    context.repoOwner,
    context.repoName,
    filePath,
    ref,
  );

  if (content === null) {
    return c.json(
      { success: false, error: "Unable to read file content (binary or not found)." },
      404,
    );
  }

  const truncated = content.length > FILE_RESPONSE_CHAR_LIMIT;
  const payload = truncated
    ? `${content.slice(0, FILE_RESPONSE_CHAR_LIMIT)}\n\n/* Truncated for viewport */`
    : content;

  return c.json({
    success: true,
    path: filePath,
    language: inferLanguage(filePath),
    truncated,
    content: payload,
  });
});

projectsApi.post("/:id/generate-description", async (c) => {
  const db = getDb(c.env.DB);
  const projectId = c.req.param("id");
  const context = await fetchProjectContext(db, projectId);

  if (!context || !context.repoOwner || !context.repoName) {
    return c.json({ success: false, error: "Project not found" }, 404);
  }

  let treeEntries: RepoTreeEntry[] = [];
  let defaultBranch = "main";
  try {
    const tree = await fetchRepositoryTree(c.env, context.repoOwner, context.repoName);
    treeEntries = tree.entries;
    defaultBranch = tree.defaultBranch;
  } catch (error) {
    console.error("[projects] Failed to fetch repository tree for summary:", error);
  }

  const filePaths = treeEntries
    .filter((entry) => entry.type === "blob")
    .map((entry) => entry.path);
  const candidateFiles = pickSummaryFiles(filePaths);

  const snippets: string[] = [];
  for (const path of candidateFiles) {
    const content = await fetchRepositoryFileText(
      c.env,
      context.repoOwner,
      context.repoName,
      path,
      defaultBranch,
    );
    if (!content) continue;
    snippets.push(`FILE: ${path}\n${content.slice(0, 3500)}`);
  }

  const treePreview = filePaths.slice(0, 200).join("\n");
  const prompt = [
    "Write a concise, technical project description (2-4 sentences).",
    "Focus on what the repository does, core architecture, and primary capabilities.",
    "Do not mention uncertainty.",
    "",
    `Repository: ${context.repoOwner}/${context.repoName}`,
    `Current description: ${context.projectDescription || context.repoDescription || "none"}`,
    "",
    "Repository tree preview:",
    treePreview,
    "",
    "Code and config snippets:",
    snippets.join("\n\n---\n\n"),
  ].join("\n");

  try {
    const provider = resolveDefaultAiProvider(c.env);
    const model = resolveDefaultAiModel(c.env, provider);
    const generatedDescription = (await runTextAgent({
      env: c.env,
      provider,
      model,
      name: "ProjectDescriptionAgent",
      instructions:
        "You summarize software repositories precisely and concisely for engineering dashboards.",
      input: prompt,
    })).trim();

    const now = new Date().toISOString();
    await db
      .update(projects)
      .set({
        description: generatedDescription,
        updatedAt: now,
      })
      .where(eq(projects.id, projectId));

    await db
      .update(repositories)
      .set({
        humanSummary: generatedDescription,
        updatedAt: now,
      })
      .where(eq(repositories.id, context.repoId));

    return c.json({
      success: true,
      description: generatedDescription,
    });
  } catch (error: any) {
    console.error("[projects] Failed to generate description:", error);
    return c.json(
      { success: false, error: error?.message || "Failed to generate description." },
      500,
    );
  }
});

projectsApi.post("/:id/assistant", async (c) => {
  const db = getDb(c.env.DB);
  const projectId = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as { prompt?: string };
  const prompt = String(body.prompt || "").trim();

  if (!prompt) {
    return c.json({ success: false, error: "Prompt is required." }, 400);
  }

  const context = await fetchProjectContext(db, projectId);
  if (!context || !context.repoOwner || !context.repoName) {
    return c.json({ success: false, error: "Project not found" }, 404);
  }

  try {
    const settings = await resolveEffectiveAgentSettings(
      db,
      c.req.header("x-user-id") || c.req.query("userId"),
    );
    const provider = (settings.preferredProvider || resolveDefaultAiProvider(c.env)) as any;
    const model = settings.preferredModel || resolveDefaultAiModel(c.env, provider);
    const runner = await createRunner(c.env, provider, model);
    const agent = new OpenAIAgent({
      name: "ProjectAssistantAgent",
      model,
      outputType: AssistantResponseSchema,
      instructions: [
        "You are an engineering project assistant for repository operations.",
        "You can propose PRDs, plan structures (epic > user stories > tasks), and actionable execution tasks.",
        "If the prompt asks to assign work to Jules, set `assignJulesTask` with the exact task text.",
        "If the prompt asks for a PRD, return it in `prd` and summarize in `reply`.",
        "If the prompt asks to outline plan structure, return `plan` using epics > userStories > tasks.",
        settings.enforceGoldenPath
          ? buildGoldenPathInstructions(settings.customInstructions)
          : settings.customInstructions,
        "Always keep `reply` concise and actionable.",
      ].join(" "),
    });

    const aiInput = [
      `Project: ${context.projectName}`,
      `Repository: ${context.repoOwner}/${context.repoName}`,
      `Infrastructure: ${context.repoInfrastructure || "unknown"}`,
      `Description: ${context.projectDescription || context.repoDescription || "none"}`,
      "",
      `User prompt: ${prompt}`,
    ].join("\n");

    const result = await runner.run(agent, aiInput);
    const parsed = AssistantResponseSchema.parse(result.finalOutput || { reply: "" });

    let planSaved:
      | {
          epicsCreated: number;
          userStoriesCreated: number;
          tasksCreated: number;
        }
      | null = null;

    if (parsed.plan) {
      planSaved = await savePlanToProjectTables(
        db,
        context.projectId,
        context.repoId,
        parsed.plan,
      );
    }

    let jules:
      | {
          dispatched: boolean;
          message: string;
        }
      | null = null;

    if (parsed.assignJulesTask) {
      jules = await dispatchTaskToJules(c.env, {
        projectId: context.projectId,
        projectName: context.projectName,
        repoFullName: `${context.repoOwner}/${context.repoName}`,
        prompt: parsed.assignJulesTask,
      });
    }

    return c.json({
      success: true,
      ...parsed,
      planSaved,
      jules,
    });
  } catch (error: any) {
    console.error("[projects] Assistant request failed:", error);
    return c.json(
      { success: false, error: error?.message || "Assistant request failed." },
      500,
    );
  }
});

projectsApi.post("/:id/vibe-coding/chat", async (c) => {
  const db = getDb(c.env.DB);
  const projectId = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as { prompt?: string };
  const prompt = String(body.prompt || "").trim();

  if (!prompt) {
    return c.json({ success: false, error: "Prompt is required." }, 400);
  }

  const context = await fetchProjectContext(db, projectId);
  if (!context || !context.repoOwner || !context.repoName) {
    return c.json({ success: false, error: "Project not found" }, 404);
  }

  try {
    const settings = await resolveEffectiveAgentSettings(
      db,
      c.req.header("x-user-id") || c.req.query("userId"),
    );

    const codeGenerator = new CodeGeneratorAgent(c.env);
    const response = await codeGenerator.run({
      projectName: context.projectName,
      repoFullName: `${context.repoOwner}/${context.repoName}`,
      prompt,
      customInstructions: settings.enforceGoldenPath
        ? settings.customInstructions
        : `Golden path disabled. ${settings.customInstructions || ""}`,
      preferredProvider: settings.preferredProvider,
      preferredModel: settings.preferredModel,
    });

    let jules:
      | {
          dispatched: boolean;
          message: string;
        }
      | null = null;

    if (response.taskForJules) {
      jules = await dispatchTaskToJules(c.env, {
        projectId: context.projectId,
        projectName: context.projectName,
        repoFullName: `${context.repoOwner}/${context.repoName}`,
        prompt: response.taskForJules,
      });
    }

    return c.json({
      success: true,
      ...response,
      jules,
      provider: settings.preferredProvider,
      model: settings.preferredModel,
    });
  } catch (error: any) {
    console.error("[projects] Vibe coding request failed:", error);
    return c.json(
      {
        success: false,
        error: error?.message || "Code generation request failed.",
      },
      500,
    );
  }
});

projectsApi.get("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const projectId = c.req.param("id");

  const project = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!project) return c.json({ success: false, error: "Project not found" }, 404);

  const phases = await db
    .select()
    .from(projectPhases)
    .where(eq(projectPhases.projectId, projectId))
    .orderBy(asc(projectPhases.startDate));

  return c.json({ success: true, project, phases });
});

projectsApi.get("/:id/plan-tree", async (c) => {
  const db = getDb(c.env.DB);
  const projectId = c.req.param("id");

  const rows = await db
    .select()
    .from(projectPlans)
    .where(eq(projectPlans.projectId, projectId))
    .orderBy(asc(projectPlans.itemType), asc(projectPlans.orderIndex), asc(projectPlans.createdAt));

  return c.json({
    success: true,
    projectId,
    items: rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      parentId: row.parentId,
      itemType: row.itemType,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      orderIndex: row.orderIndex,
      metadata: row.metadataJson ? JSON.parse(row.metadataJson) : {},
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
  });
});

projectsApi.delete("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const projectId = c.req.param("id");
  await db.delete(projects).where(eq(projects.id, projectId));
  return c.json({ success: true });
});

// --- Phases ---

projectsApi.post("/:id/phases", async (c) => {
  const db = getDb(c.env.DB);
  const projectId = c.req.param("id");
  const body = await c.req.json();

  const newPhase = {
    id: crypto.randomUUID(),
    projectId,
    name: body.name,
    description: body.description,
    status: "pending",
    startDate: body.startDate,
    endDate: body.endDate,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await db.insert(projectPhases).values(newPhase);
  return c.json({ success: true, phase: newPhase });
});

projectsApi.patch("/phases/:phaseId", async (c) => {
  const db = getDb(c.env.DB);
  const phaseId = c.req.param("phaseId");
  const body = await c.req.json();

  await db
    .update(projectPhases)
    .set({ ...body, updatedAt: new Date().toISOString() })
    .where(eq(projectPhases.id, phaseId));

  return c.json({ success: true });
});

projectsApi.delete("/phases/:phaseId", async (c) => {
  const db = getDb(c.env.DB);
  const phaseId = c.req.param("phaseId");
  await db.delete(projectPhases).where(eq(projectPhases.id, phaseId));
  return c.json({ success: true });
});

// --- AI Generation ---

projectsApi.post("/phases/:phaseId/generate-instructions", async (c) => {
  const db = getDb(c.env.DB);
  const phaseId = c.req.param("phaseId");

  const phase = await db
    .select()
    .from(projectPhases)
    .where(eq(projectPhases.id, phaseId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!phase) return c.json({ error: "Phase not found" }, 404);

  const project = await db
    .select()
    .from(projects)
    .where(eq(projects.id, phase.projectId))
    .limit(1)
    .then((rows) => rows[0]);

  let repoContext = "";
  if (project && project.repoId) {
    const repo = await db
      .select()
      .from(repositories)
      .where(eq(repositories.id, project.repoId))
      .limit(1)
      .then((rows) => rows[0]);

    if (repo) {
      repoContext = `
      REPOSITORY: ${repo.name}
      INFRASTRUCTURE: ${repo.infrastructure}
      DESCRIPTION: ${repo.description}
      `;
    }
  }

  const prompt = `
  You are a Technical Lead and Cloudflare Expert.
  Write detailed TECHNICAL INSTRUCTIONS for the following Project Phase.

  PROJECT: ${project?.name}
  PHASE: ${phase.name}
  PHASE STATUS: ${phase.status}
  PHASE DESCRIPTION: ${phase.description}

  CONTEXT:
  ${repoContext}

  Your instructions should be specific, actionable, and tailored to the Cloudflare stack if applicable.
  Include:
  - Key technical steps to implement this phase.
  - Necessary bindings or configuration changes (wrangler.toml).
  - Pseudocode or API structure if relevant.
  - Verification steps (Success Criteria).

  Format the output in Markdown.
  `;

  try {
    const provider = resolveDefaultAiProvider(c.env);
    const model = resolveDefaultAiModel(c.env, provider);
    const text = await runTextAgent({
      env: c.env,
      provider,
      model,
      name: "ProjectPhaseInstructionsAgent",
      instructions:
        "You are a technical lead. Produce implementation-ready markdown instructions.",
      input: prompt,
    });

    await db
      .update(projectPhases)
      .set({
        technicalInstructions: text,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(projectPhases.id, phaseId));

    return c.json({ success: true, instructions: text });
  } catch (error: any) {
    console.error("AI Generation Failed:", error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default projectsApi;
