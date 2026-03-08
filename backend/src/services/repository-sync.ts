
import { eq, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@db";
import { projects } from "@db/schemas/projects/roadmap";
import { repositories } from "@db/schemas/github/repos";
import { Octokit } from "octokit";
import { getGithubConfigs } from "@github-utils";
import { getOctokit } from "@services/octokit/core";
import type { Bindings } from "@utils/hono";
import { generateUuid } from "@/utils/common";
// Removed @openai/agents import

type RepoVisibility = "public" | "private" | "internal";

type GitHubRepositoryLike = {
  name?: string | null;
  full_name?: string | null;
  html_url?: string | null;
  description?: string | null;
  private?: boolean;
  visibility?: string | null;
  topics?: string[] | null;
  is_template?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  owner?: {
    login?: string | null;
  } | null;
};

type UpsertRepoOptions = {
  ownerOverride?: string;
  infrastructure?: string | null;
};

type CreateProjectRepoInput = {
  owner?: string;
  projectName: string;
  repoName?: string;
  description?: string;
  visibility?: RepoVisibility;
  infrastructure?: string | null;
};

type EnsureProjectOptions = {
  name: string;
  description?: string | null;
  owner?: string | null;
  status?: string;
};

type SyncOptions = {
  ensureProjects?: boolean;
};

type SyncIfStaleOptions = SyncOptions & {
  force?: boolean;
  minIntervalMs?: number;
};

type RepoCompatRow = {
  id: string;
  provider: string;
  owner: string;
  name: string;
  slug: string;
  repo_url: string;
  description: string | null;
  topics_json: string;
  visibility: RepoVisibility;
  is_template: number;
  criticality: number;
  created_at: string;
  updated_at: string;
  infrastructure?: string | null;
};

type SyncRepositoryRow = {
  id: string;
  provider: string;
  owner: string;
  name: string;
  slug: string;
  repoUrl: string;
  description: string | null;
  topicsJson: string;
  visibility: RepoVisibility;
  isTemplate: boolean;
  criticality: number;
  createdAt: string;
  updatedAt: string;
  infrastructure: string | null;
};

const SYNC_BATCH_SIZE = 50;

const REPO_BASE_COLUMNS = [
  "id",
  "provider",
  "owner",
  "name",
  "slug",
  "repo_url",
  "description",
  "topics_json",
  "visibility",
  "is_template",
  "criticality",
  "created_at",
  "updated_at",
] as const;

/**
 * @deprecated This compat upsert path exists only for environments where the
 * `repositories` table schema has drifted from the Drizzle-managed schema.
 * It falls back to raw D1 statements when the normal Drizzle insert throws.
 * New code MUST NOT call this directly — use `upsertRepositoryFromGitHub()` instead.
 */

function chunkArray<T>(input: readonly T[], size: number = SYNC_BATCH_SIZE): T[][] {
  if (input.length === 0) return [];
  const chunkSize = Number.isFinite(size) && size > 0 ? Math.floor(size) : SYNC_BATCH_SIZE;
  const chunks: T[][] = [];
  for (let i = 0; i < input.length; i += chunkSize) {
    chunks.push(input.slice(i, i + chunkSize));
  }
  return chunks;
}

async function getTableColumns(d1: D1Database, tableName: string): Promise<Set<string>> {
  const result = await d1.prepare(`PRAGMA table_info(${tableName})`).all();
  const rows = (result.results || []) as Array<{ name?: string }>;
  return new Set(rows.map((row) => String(row.name || "")).filter(Boolean));
}

async function upsertRepositoryCompat(
  env: Env,
  row: RepoCompatRow,
): Promise<void> {
  const columns = await getTableColumns(env.DB, "repositories");
  if (!columns.has("id")) {
    throw new Error("repositories table missing required 'id' column.");
  }

  let targetId = row.id;
  if (columns.has("slug")) {
    const existingBySlug = await env.DB
      .prepare("SELECT id FROM repositories WHERE slug = ? LIMIT 1")
      .bind(row.slug)
      .first<{ id?: string | number }>();

    if (existingBySlug?.id !== undefined && existingBySlug?.id !== null) {
      targetId = String(existingBySlug.id);
    }
  }

  if (
    targetId === row.id &&
    columns.has("owner") &&
    columns.has("name")
  ) {
    const existingByOwnerAndName = await env.DB
      .prepare(
        "SELECT id FROM repositories WHERE lower(owner) = lower(?) AND lower(name) = lower(?) LIMIT 1",
      )
      .bind(row.owner, row.name)
      .first<{ id?: string | number }>();

    if (
      existingByOwnerAndName?.id !== undefined &&
      existingByOwnerAndName?.id !== null
    ) {
      targetId = String(existingByOwnerAndName.id);
    }
  }

  const insertColumns: string[] = [];
  const insertValues: unknown[] = [];

  for (const column of REPO_BASE_COLUMNS) {
    if (!columns.has(column)) continue;
    insertColumns.push(column);
    insertValues.push(
      column === "id"
        ? targetId
        : (row as Record<string, unknown>)[column],
    );
  }

  if (columns.has("infrastructure")) {
    insertColumns.push("infrastructure");
    insertValues.push(row.infrastructure || null);
  }

  const updateColumns = [
    "owner",
    "name",
    "slug",
    "repo_url",
    "description",
    "topics_json",
    "visibility",
    "is_template",
    "updated_at",
    ...(columns.has("infrastructure") ? ["infrastructure"] : []),
  ];

  const updateAssignments = updateColumns
    .filter((column) => columns.has(column))
    .map((column) => `${column} = excluded.${column}`);

  const placeholders = insertColumns.map(() => "?").join(", ");
  const statement =
    updateAssignments.length > 0
      ? `INSERT INTO repositories (${insertColumns.join(", ")}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updateAssignments.join(", ")}`
      : `INSERT OR IGNORE INTO repositories (${insertColumns.join(", ")}) VALUES (${placeholders})`;

  await env.DB.prepare(statement).bind(...insertValues).run();
}

function normalizeVisibility(repo: GitHubRepositoryLike): RepoVisibility {
  if (repo.visibility === "public" || repo.visibility === "private" || repo.visibility === "internal") {
    return repo.visibility;
  }

  return repo.private ? "private" : "public";
}

function splitFullName(fullName?: string | null): { owner?: string; name?: string } {
  if (!fullName || !fullName.includes("/")) return {};
  const [owner, name] = fullName.split("/");
  return { owner, name };
}

export function resolveGitHubOwner(env: Env, owner?: string): string {
  const config = getGithubConfigs(env);
  const resolved = owner || config.owner;
  return resolved.trim();
}

export function toRepositoryId(owner: string, name: string): string {
  return `github:${owner}/${name}`;
}

export function sanitizeRepositoryName(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 100);

  return normalized || `project-${Date.now()}`;
}

function mapGitHubRepoToSyncRow(
  repo: GitHubRepositoryLike,
  owner: string,
): SyncRepositoryRow | null {
  const repoName = repo.name || splitFullName(repo.full_name).name;
  if (!repoName) return null;

  const repoId = toRepositoryId(owner, repoName);
  const now = new Date().toISOString();

  return {
    id: repoId,
    provider: "github",
    owner,
    name: repoName,
    slug: repoId,
    infrastructure: null,
    repoUrl: repo.html_url || `https://github.com/${owner}/${repoName}`,
    description: repo.description || null,
    topicsJson: JSON.stringify(repo.topics || []),
    visibility: normalizeVisibility(repo),
    isTemplate: Boolean(repo.is_template),
    criticality: 0,
    createdAt: repo.created_at || now,
    updatedAt: repo.updated_at || now,
  };
}

async function batchUpsertRepositoriesForSync(
  env: Env,
  rows: SyncRepositoryRow[],
): Promise<{ repoIds: string[]; reposCreated: number }> {
  if (rows.length === 0) {
    return { repoIds: [], reposCreated: 0 };
  }


  // --- Batch ID resolution via a single Drizzle query ---
  // Instead of firing N prepared statements, fetch all existing records
  // that match by slug using a single inArray() query. This is fully typed
  // and avoids raw D1 client access entirely.
  const allSlugs = rows.map((r) => r.slug);
  const db = getDb(env.DB);
  const existingBySlug: Array<{ id: string; slug: string }> = [];
  for (const slugBatch of chunkArray(allSlugs, SYNC_BATCH_SIZE)) {
    const batch = await db
      .select({ id: repositories.id, slug: repositories.slug })
      .from(repositories)
      .where(inArray(repositories.slug, slugBatch));
    existingBySlug.push(...batch);
  }
  const slugToId = new Map(existingBySlug.map((r) => [r.slug, r.id]));

  const resolved = rows.map((row) => {
    const targetId = String(slugToId.get(row.slug) ?? row.id);
    return { ...row, id: targetId };
  });

  const uniqueIds = Array.from(new Set(resolved.map((row) => row.id)));
  const existing: Array<{ id: string }> = [];
  for (const idBatch of chunkArray(uniqueIds, SYNC_BATCH_SIZE)) {
    const rowsForBatch = await db
      .select({ id: repositories.id })
      .from(repositories)
      .where(inArray(repositories.id, idBatch));
    existing.push(...rowsForBatch);
  }
  const existingIdSet = new Set(existing.map((row) => row.id));
  const reposCreated = resolved.reduce(
    (count, row) => count + (existingIdSet.has(row.id) ? 0 : 1),
    0,
  );

  // All columns known to always be present in the current Drizzle-managed schema.
  const insertColumns: string[] = [
    "id", "provider", "owner", "name", "slug", "repo_url",
    "description", "topics_json", "visibility", "is_template", "criticality",
    "created_at", "updated_at",
  ];

  // Remove the unused columns helper — inArray resolution no longer needs it.
  const updateColumns = [
    "owner", "name", "slug", "repo_url", "description",
    "topics_json", "visibility", "is_template", "updated_at",
  ];

  const placeholders = insertColumns.map(() => "?").join(", ");
  const updateAssignments = updateColumns.map((c) => `${c} = excluded.${c}`);
  const statementText = `INSERT INTO repositories (${insertColumns.join(", ")}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updateAssignments.join(", ")}`;

  for (let i = 0; i < resolved.length; i += SYNC_BATCH_SIZE) {
    const chunk = resolved.slice(i, i + SYNC_BATCH_SIZE);
    const statements = chunk.map((row) => {
      const values = insertColumns.map((column) => {
        switch (column) {
          case "id":
            return row.id;
          case "provider":
            return row.provider;
          case "owner":
            return row.owner;
          case "name":
            return row.name;
          case "slug":
            return row.slug;
          case "repo_url":
            return row.repoUrl;
          case "description":
            return row.description;
          case "topics_json":
            return row.topicsJson;
          case "visibility":
            return row.visibility;
          case "is_template":
            return row.isTemplate ? 1 : 0;
          case "criticality":
            return row.criticality;
          case "created_at":
            return row.createdAt;
          case "updated_at":
            return row.updatedAt;
          case "infrastructure":
            return row.infrastructure;
          default:
            return null;
        }
      });
      return env.DB.prepare(statementText).bind(...values);
    });
    await env.DB.batch(statements);
  }

  return {
    repoIds: resolved.map((row) => row.id),
    reposCreated,
  };
}

export async function upsertRepositoryFromGitHub(
  env: Env,
  repo: GitHubRepositoryLike,
  options: UpsertRepoOptions = {},
): Promise<{ repoId: string; created: boolean }> {
  const db = getDb(env.DB);
  const fromFullName = splitFullName(repo.full_name);
  const owner =
    options.ownerOverride ||
    repo.owner?.login ||
    fromFullName.owner ||
    resolveGitHubOwner(env);
  const name = repo.name || fromFullName.name;

  if (!owner || !name) {
    throw new Error("Repository owner/name missing from GitHub payload.");
  }

  const now = new Date().toISOString();
  const repoId = toRepositoryId(owner, name);
  const repoUrl = repo.html_url || `https://github.com/${owner}/${name}`;
  const visibility = normalizeVisibility(repo);

  const existing = await db
    .select({ id: repositories.id })
    .from(repositories)
    .where(eq(repositories.id, repoId))
    .limit(1);

  let naturalKeyMatchId: string | null = null;
  try {
    const naturalKeyMatch = await db
      .select({ id: repositories.id })
      .from(repositories)
      .where(
        or(
          eq(repositories.slug, repoId),
          sql`lower(${repositories.owner}) = lower(${owner}) and lower(${repositories.name}) = lower(${name})`,
        ),
      )
      .limit(1);

    naturalKeyMatchId = naturalKeyMatch[0]?.id ?? null;
  } catch {
    // Older/partial schemas may not support one of these fields.
  }

  const targetRepoId = existing[0]?.id || naturalKeyMatchId || repoId;

  const setOnConflict: Partial<typeof repositories.$inferInsert> = {
    owner,
    name,
    slug: repoId,
    repoUrl,
    description: repo.description || null,
    topicsJson: JSON.stringify(repo.topics || []),
    visibility,
    isTemplate: repo.is_template ?? false,
    updatedAt: repo.updated_at || now,
  };

  if (typeof options.infrastructure !== "undefined") {
    setOnConflict.infrastructure = options.infrastructure || null;
  }

  try {
    await db
      .insert(repositories)
      .values({
        id: targetRepoId,
        provider: "github",
        owner,
        name,
        slug: repoId,
        infrastructure: options.infrastructure || null,
        repoUrl,
        description: repo.description || null,
        topicsJson: JSON.stringify(repo.topics || []),
        visibility,
        isTemplate: repo.is_template ?? false,
        createdAt: repo.created_at || now,
        updatedAt: repo.updated_at || now,
      })
      .onConflictDoUpdate({
        target: repositories.id,
        set: setOnConflict,
      });
  } catch (error) {
    // Backward-compatible fallback for environments with older repositories schema.
    await upsertRepositoryCompat(env, {
      id: targetRepoId,
      provider: "github",
      owner,
      name,
      slug: repoId,
      repo_url: repoUrl,
      description: repo.description || null,
      topics_json: JSON.stringify(repo.topics || []),
      visibility,
      is_template: repo.is_template ? 1 : 0,
      criticality: 0,
      created_at: repo.created_at || now,
      updated_at: repo.updated_at || now,
      infrastructure: options.infrastructure || null,
    });

    console.log(`[RepoSync] Upserted ${owner}/${name} to DB`, JSON.stringify(error));
  }

  return {
    repoId: targetRepoId,
    created: existing.length === 0 && !naturalKeyMatchId,
  };
}

export async function ensureProjectForRepository(
  env: Env,
  repoId: string,
  options: EnsureProjectOptions,
): Promise<{ projectId: string; created: boolean }> {
  const db = getDb(env.DB);
  const existing = await db
    .select()
    .from(projects)
    .where(eq(projects.repoId, repoId))
    .limit(1)
    .then((rows) => rows[0]);

  if (existing) {
    return { projectId: existing.id, created: false };
  }

  const now = new Date().toISOString();
  const projectId = crypto.randomUUID();

  await db.insert(projects).values({
    id: projectId,
    repoId,
    name: options.name,
    description: options.description || null,
    owner: options.owner || null,
    status: options.status || "active",
    createdAt: now,
    updatedAt: now,
  });

  return { projectId, created: true };
}

async function listOwnerRepositoriesFromGitHub(
  env: Env,
  owner: string,
): Promise<GitHubRepositoryLike[]> {
  const octokit = await getOctokit(env);
  const normalizedOwner = owner.toLowerCase();

  try {
    const auth = await octokit.users.getAuthenticated();
    const authLogin = auth.data.login.toLowerCase();

    if (authLogin === normalizedOwner) {
      const repos = await octokit.paginate("GET /user/repos", {
        affiliation: "owner",
        per_page: 100,
        sort: "updated",
      });
      return repos as GitHubRepositoryLike[];
    }
  } catch {
    // Fallback to public user listing below.
  }

  const repos = await octokit.paginate("GET /users/{username}/repos", {
    username: owner,
    type: "owner",
    per_page: 100,
    sort: "updated",
  });
  return repos as GitHubRepositoryLike[];
}

export async function syncOwnerRepositories(
  env: Env,
  ownerInput?: string,
  options: SyncOptions = {},
): Promise<{
  owner: string;
  reposSeen: number;
  reposCreated: number;
  projectsCreated: number;
}> {
  const owner = resolveGitHubOwner(env, ownerInput);
  const repos = await listOwnerRepositoriesFromGitHub(env, owner);
  const ownerLower = owner.toLowerCase();

  const syncRows = repos
    .filter((repo) => {
      const repoOwner =
        repo.owner?.login ||
        splitFullName(repo.full_name).owner ||
        "";
      return repoOwner.toLowerCase() === ownerLower;
    })
    .map((repo) => mapGitHubRepoToSyncRow(repo, owner))
    .filter((row): row is SyncRepositoryRow => Boolean(row));

  const { repoIds, reposCreated } = await batchUpsertRepositoriesForSync(env, syncRows);

  let projectsCreated = 0;

  if (options.ensureProjects && repoIds.length > 0) {
    const db = getDb(env.DB);
    const existingProjects: Array<{ repoId: string }> = [];
    for (const repoIdBatch of chunkArray(repoIds, SYNC_BATCH_SIZE)) {
      const rowsForBatch = await db
        .select({ repoId: projects.repoId })
        .from(projects)
        .where(inArray(projects.repoId, repoIdBatch));
      existingProjects.push(...rowsForBatch);
    }
    const existingRepoIds = new Set(existingProjects.map((row) => row.repoId));

    const now = new Date().toISOString();
    const projectsToCreate = syncRows
      .filter((row) => !existingRepoIds.has(row.id))
      .map((row) => ({
        id: generateUuid(),
        repoId: row.id,
        name: row.name,
        description: row.description || null,
        owner,
        status: "active",
        createdAt: now,
        updatedAt: now,
      }));

    if (projectsToCreate.length > 0) {
      // D1 has a parameter limit (~100). Each project row has ~8 columns,
      // so batches of 10 keep us safely under the limit (10 × 8 = 80 params).
      const PROJECT_CHUNK_SIZE = 10;
      for (const chunk of chunkArray(projectsToCreate, PROJECT_CHUNK_SIZE)) {
        await db.insert(projects).values(chunk).onConflictDoNothing();
      }
      projectsCreated = projectsToCreate.length;
    }
  }

  return {
    owner,
    reposSeen: repos.length,
    reposCreated,
    projectsCreated,
  };
}

export async function syncOwnerRepositoriesIfStale(
  env: Env,
  ownerInput?: string,
  options: SyncIfStaleOptions = {},
): Promise<{
  owner: string;
  skipped: boolean;
  reposSeen: number;
  reposCreated: number;
  projectsCreated: number;
  lastSyncedAt: string;
}> {
  const owner = resolveGitHubOwner(env, ownerInput);
  const key = `repo-sync:${owner.toLowerCase()}`;
  const minIntervalMs = options.minIntervalMs ?? 5 * 60 * 1000;
  const now = Date.now();

  if (!options.force) {
    const lastRaw = await env.ETAG_KV.get(key);
    if (lastRaw) {
      const last = Number.parseInt(lastRaw, 10);
      if (!Number.isNaN(last) && now - last < minIntervalMs) {
        return {
          owner,
          skipped: true,
          reposSeen: 0,
          reposCreated: 0,
          projectsCreated: 0,
          lastSyncedAt: new Date(last).toISOString(),
        };
      }
    }
  }

  const synced = await syncOwnerRepositories(env, owner, {
    ensureProjects: options.ensureProjects ?? false,
  });

  await env.ETAG_KV.put(key, String(now), { expirationTtl: 60 * 60 * 24 * 7 });

  return {
    ...synced,
    skipped: false,
    lastSyncedAt: new Date(now).toISOString(),
  };
}

export async function ensureRepositoryFromWebhook(
  env: Env,
  repo?: GitHubRepositoryLike | null,
): Promise<{ skipped: boolean; repoId?: string; projectCreated?: boolean }> {
  if (!repo) return { skipped: true };

  const configuredOwner = resolveGitHubOwner(env);
  const repoOwner = repo.owner?.login || splitFullName(repo.full_name).owner;

  if (!repoOwner || repoOwner.toLowerCase() !== configuredOwner.toLowerCase()) {
    return { skipped: true };
  }

  const upserted = await upsertRepositoryFromGitHub(env, repo, {
    ownerOverride: configuredOwner,
  });

  let projectCreated: boolean | undefined;
  try {
    const ensured = await ensureProjectForRepository(env, upserted.repoId, {
      name: repo.name || splitFullName(repo.full_name).name || upserted.repoId,
      description: repo.description || null,
      owner: configuredOwner,
      status: "active",
    });
    projectCreated = ensured.created;
  } catch (error) {
    console.error(
      `[repository-sync] Failed to ensure project for webhook repo ${upserted.repoId}:`,
      error,
    );
  }

  return {
    skipped: false,
    repoId: upserted.repoId,
    projectCreated,
  };
}

export async function createOrGetRepositoryForProject(
  env: Env,
  input: CreateProjectRepoInput,
): Promise<{
  owner: string;
  repoName: string;
  repoId: string;
  githubRepoCreated: boolean;
}> {
  const owner = resolveGitHubOwner(env, input.owner);
  const repoName = sanitizeRepositoryName(input.repoName || input.projectName);
  const octokit = await getOctokit(env);
  const isPrivate = (input.visibility || "private") !== "public";

  let repoData: GitHubRepositoryLike | null = null;
  let githubRepoCreated = false;

  try {
    const auth = await octokit.users.getAuthenticated();
    if (auth.data.login.toLowerCase() === owner.toLowerCase()) {
      const created = await octokit.repos.createForAuthenticatedUser({
        name: repoName,
        description: input.description || "",
        private: isPrivate,
        auto_init: true,
      });
      repoData = created.data as GitHubRepositoryLike;
      githubRepoCreated = true;
    } else {
      const created = await octokit.repos.createInOrg({
        org: owner,
        name: repoName,
        description: input.description || "",
        private: isPrivate,
      });
      repoData = created.data as GitHubRepositoryLike;
      githubRepoCreated = true;
    }
  } catch (error: any) {
    if (error?.status !== 422) {
      throw error;
    }

    const existing = await octokit.repos.get({
      owner,
      repo: repoName,
    });
    repoData = existing.data as GitHubRepositoryLike;
  }

  if (!repoData) {
    throw new Error("GitHub repository creation failed with no repository payload.");
  }

  const upserted = await upsertRepositoryFromGitHub(env, repoData, {
    ownerOverride: owner,
    infrastructure: input.infrastructure || null,
  });

  return {
    owner,
    repoName,
    repoId: upserted.repoId,
    githubRepoCreated,
  };
}
