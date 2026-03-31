/**
 * @file utils.ts
 * @description Shared utility functions and constants for the projects modular route.
 * Optimized for AI coding agents with clear block-level documentation.
 */

import { repositories } from "@db/schema";
import { getDb } from "@db";
import { eq } from "drizzle-orm";
import JSON5 from "json5";

export const OVERVIEW_TREE_LIMIT = 1500;
export const FILE_RESPONSE_CHAR_LIMIT = 120_000;
export const DEFAULT_CONTROL_CENTER_USER = "default-user";

/**
 * Normalizes a user ID string, falling back to a default if empty.
 */
export function normalizeControlCenterUserId(input?: string | null): string {
  const normalized = String(input || "").trim();
  return normalized || DEFAULT_CONTROL_CENTER_USER;
}

/**
 * Generates a unique v4 UUID.
 */
export function generateUuid(): string {
  return crypto.randomUUID();
}

/**
 * Safely parses JSONC/JSON5 strings with a custom fallback for comments/trailing commas.
 */
export function parseJsonc(raw: string): any {
  try {
    return JSON5.parse(raw);
  } catch (err: any) {
    try {
      const stripped = raw
        .replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) => g ? "" : m)
        .replace(/,\s*([\]}])/g, "$1");
      return JSON.parse(stripped);
    } catch (fallbackErr: any) {
      console.error("Failed to parse JSONC/JSON5", JSON.stringify(fallbackErr));
      throw err;
    }
  }
}

/**
 * Infers appropriate language for syntax highlighting based on file extension.
 */
export function inferLanguage(path: string): string {
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

/**
 * Fetches comprehensive project and repository context from the database.
 * Now maps the repository entity directly to the legacy project context format.
 */
export async function fetchProjectContext(
  db: ReturnType<typeof getDb>,
  projectId: string,
) {
  const rows = await db
    .select({
      projectId: repositories.id,
      projectName: repositories.name,
      projectDescription: repositories.description,
      projectStatus: repositories.lifecycleStage,
      projectCreatedAt: repositories.createdAt,
      projectUpdatedAt: repositories.updatedAt,
      projectOwner: repositories.owner,
      repoId: repositories.id,
      repoOwner: repositories.owner,
      repoName: repositories.name,
      repoUrl: repositories.repoUrl,
      repoDescription: repositories.description,
      repoInfrastructure: repositories.infrastructure,
      repoUpdatedAt: repositories.updatedAt,
    })
    .from(repositories)
    .where(eq(repositories.id, projectId))
    .limit(1);

  return rows[0] || null;
}

/**
 * Fetches project/repository context by owner + repo name pair.
 * Preferred over fetchProjectContext for routes using /:owner/:repo params
 * to avoid compound-ID slug ambiguity.
 */
export async function fetchProjectContextByOwnerRepo(
  db: ReturnType<typeof getDb>,
  owner: string,
  repo: string,
) {
  const { and, sql } = await import("drizzle-orm");
  const rows = await db
    .select({
      projectId: repositories.id,
      projectName: repositories.name,
      projectDescription: repositories.description,
      projectStatus: repositories.lifecycleStage,
      projectCreatedAt: repositories.createdAt,
      projectUpdatedAt: repositories.updatedAt,
      projectOwner: repositories.owner,
      repoId: repositories.id,
      repoOwner: repositories.owner,
      repoName: repositories.name,
      repoUrl: repositories.repoUrl,
      repoDescription: repositories.description,
      repoInfrastructure: repositories.infrastructure,
      repoUpdatedAt: repositories.updatedAt,
    })
    .from(repositories)
    .where(and(
      sql`lower(${repositories.owner}) = lower(${owner})`,
      sql`lower(${repositories.name}) = lower(${repo})`,
    ))
    .limit(1);

  return rows[0] || null;
}


/**
 * Extract resource bindings from a hydrated wrangler configuration object.
 */
export function extractWranglerBindings(config: any) {
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
    ...(config?.queues?.producers ? toNames(config.queues.producers, ["binding", "queue"]) : []),
    ...(config?.queues?.consumers ? toNames(config.queues.consumers, ["queue", "binding"]) : []),
  ];

  const aiBinding = typeof config?.ai?.binding === "string" ? config.ai.binding : null;

  return {
    kv: toNames(config?.kv_namespaces, ["binding", "name"]),
    d1: toNames(config?.d1_databases, ["binding", "database_id"]),
    durableObjects: toNames(config?.durable_objects?.bindings, ["name", "binding"]),
    r2: toNames(config?.r2_buckets, ["binding", "bucket_name"]),
    queues: queueNames,
    services: toNames(config?.services, ["binding", "service"]),
    workflows: toNames(config?.workflows, ["binding", "name"]),
    ai: aiBinding ? [aiBinding] : [],
  };
}

/**
 * Detects and parses a wrangler configuration file (jsonc, toml, json) from a repository.
 */
export async function detectWranglerConfig(
  env: Env,
  owner: string,
  repo: string,
  ref?: string,
): Promise<{ fileName: string; config: any } | null> {
  const candidates = ["wrangler.jsonc", "wrangler.toml", "wrangler.json"];
  const { getOctokit } = await import("@/services/octokit/core");
  const octokit = await getOctokit(env);

  for (const fileName of candidates) {
    try {
      const { data } = await octokit.repos.getContent({ owner, repo, path: fileName, ...(ref ? { ref } : {}) }) as any;
      if (data.type === "file" && data.content) {
        const text = Buffer.from(data.content, "base64").toString("utf-8");
        if (fileName.endsWith(".toml")) {
            const TOML = await import("@iarna/toml");
            return { fileName, config: TOML.parse(text) };
        }
        return { fileName, config: parseJsonc(text) };
      }
    } catch (err: any) {
      console.error("Failed to parse wrangler config", JSON.stringify(err));
    }
  }
  return null;
}
