import { asc, eq } from "drizzle-orm";

import { getDb } from "@db";
import { FULL_CODE_OUTPUT_RULES } from "@/ai/utils/code-output-rules";
import {
  goldenPathConfig,
  goldenPathConfigScopes,
  goldenPathConfigTagDefinitions,
  goldenPathConfigTagMappings,
  type GoldenPathConfigRow,
  type GoldenPathConfigScopeRow,
  type GoldenPathConfigTagDefinitionRow,
} from "@db/schemas/app/golden_path";

export interface GoldenPathScopeTag {
  id: number;
  name: string;
  description: string;
  hexColor: string;
}

export interface GoldenPathScopeView {
  id: number;
  title: string;
  description: string;
  infrastructure: string;
  hexColor: string;
  tags: GoldenPathScopeTag[];
}

export interface GoldenPathConfigView {
  id: number;
  title: string;
  description: string;
  rule: string;
  scope: GoldenPathScopeView;
}

export interface GoldenPathConfigFilters {
  search?: string;
  scopeTitle?: string;
  infrastructure?: string;
  tagName?: string;
}

export interface GoldenPathGroupedDefaults {
  defaults: Record<string, string[]>;
  systemPrompt: string;
}

export const CODING_AGENT_SCOPE_TITLES = ["backend", "ai", "infra", "docs"] as const;
export const CODING_AGENT_INFRASTRUCTURES = [
  "coding-agent",
  "workers",
  "cloudflare",
  "documentation",
] as const;
export const GOLDEN_PATH_OUTPUT_DISCIPLINE = `OUTPUT DISCIPLINE\n${FULL_CODE_OUTPUT_RULES}`;

function normalizeSearch(value?: string | null): string {
  return String(value || "").trim().toLowerCase();
}

function mapScopeTags(
  scopeId: number,
  mappings: Array<typeof goldenPathConfigTagMappings.$inferSelect>,
  tags: GoldenPathConfigTagDefinitionRow[],
): GoldenPathScopeTag[] {
  const activeTagIds = new Set(
    mappings.filter((mapping) => mapping.scopeId === scopeId).map((mapping) => mapping.tagId),
  );

  return tags
    .filter((tag) => Boolean(tag.isActive) && activeTagIds.has(tag.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((tag) => ({
      id: tag.id,
      name: tag.name,
      description: tag.description,
      hexColor: tag.hexColor,
    }));
}

function mapScopeView(
  scope: GoldenPathConfigScopeRow,
  mappings: Array<typeof goldenPathConfigTagMappings.$inferSelect>,
  tags: GoldenPathConfigTagDefinitionRow[],
): GoldenPathScopeView {
  return {
    id: scope.id,
    title: scope.title,
    description: scope.description,
    infrastructure: scope.infrastructure,
    hexColor: scope.hexColor,
    tags: mapScopeTags(scope.id, mappings, tags),
  };
}

async function loadGoldenPathGraph(env: Env) {
  const db = getDb(env.DB);
  const [configs, scopes, tagDefinitions, tagMappings] = await Promise.all([
    db.select().from(goldenPathConfig).orderBy(asc(goldenPathConfig.title)).all(),
    db.select().from(goldenPathConfigScopes).orderBy(asc(goldenPathConfigScopes.title)).all(),
    db
      .select()
      .from(goldenPathConfigTagDefinitions)
      .orderBy(asc(goldenPathConfigTagDefinitions.name))
      .all(),
    db.select().from(goldenPathConfigTagMappings).all(),
  ]);

  return { configs, scopes, tagDefinitions, tagMappings };
}

export async function listGoldenPathConfigs(
  env: Env,
  filters: GoldenPathConfigFilters = {},
): Promise<GoldenPathConfigView[]> {
  const { configs, scopes, tagDefinitions, tagMappings } = await loadGoldenPathGraph(env);
  const scopeMap = new Map(scopes.map((scope) => [scope.id, scope]));
  const search = normalizeSearch(filters.search);
  const scopeTitle = normalizeSearch(filters.scopeTitle);
  const infrastructure = normalizeSearch(filters.infrastructure);
  const tagName = normalizeSearch(filters.tagName);

  return configs
    .map((config) => {
      const scope = scopeMap.get(config.scopeId);
      if (!scope) {
        return null;
      }

      return {
        id: config.id,
        title: config.title,
        description: config.description,
        rule: config.rule,
        scope: mapScopeView(scope, tagMappings, tagDefinitions),
      } satisfies GoldenPathConfigView;
    })
    .filter((config): config is GoldenPathConfigView => {
      if (!config) {
        return false;
      }

      if (scopeTitle && config.scope.title.toLowerCase() !== scopeTitle) {
        return false;
      }

      if (infrastructure && config.scope.infrastructure.toLowerCase() !== infrastructure) {
        return false;
      }

      if (
        tagName &&
        !config.scope.tags.some((tag) => tag.name.toLowerCase().includes(tagName))
      ) {
        return false;
      }

      if (!search) {
        return true;
      }

      const haystack = [
        config.title,
        config.description,
        config.rule,
        config.scope.title,
        config.scope.description,
        config.scope.infrastructure,
        ...config.scope.tags.map((tag) => `${tag.name} ${tag.description}`),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });
}

export async function listGoldenPathScopes(env: Env): Promise<GoldenPathScopeView[]> {
  const { scopes, tagDefinitions, tagMappings } = await loadGoldenPathGraph(env);

  return scopes.map((scope) => mapScopeView(scope, tagMappings, tagDefinitions));
}

export async function listGoldenPathTags(
  env: Env,
  options?: { activeOnly?: boolean; search?: string },
): Promise<GoldenPathConfigTagDefinitionRow[]> {
  const db = getDb(env.DB);
  const tags = await db
    .select()
    .from(goldenPathConfigTagDefinitions)
    .orderBy(asc(goldenPathConfigTagDefinitions.name))
    .all();

  const search = normalizeSearch(options?.search);

  return tags.filter((tag) => {
    if (options?.activeOnly && !tag.isActive) {
      return false;
    }

    if (!search) {
      return true;
    }

    return `${tag.name} ${tag.description}`.toLowerCase().includes(search);
  });
}

export async function createGoldenPathConfig(
  env: Env,
  input: {
    title: string;
    description: string;
    rule: string;
    scopeId: number;
  },
): Promise<GoldenPathConfigRow> {
  const db = getDb(env.DB);
  const now = new Date().toISOString();

  const [row] = await db
    .insert(goldenPathConfig)
    .values({
      title: input.title.trim(),
      description: input.description.trim(),
      rule: input.rule.trim(),
      scopeId: input.scopeId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return row;
}

export async function updateGoldenPathConfig(
  env: Env,
  id: number,
  input: {
    title: string;
    description: string;
    rule: string;
    scopeId: number;
  },
): Promise<void> {
  const db = getDb(env.DB);
  await db
    .update(goldenPathConfig)
    .set({
      title: input.title.trim(),
      description: input.description.trim(),
      rule: input.rule.trim(),
      scopeId: input.scopeId,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(goldenPathConfig.id, id))
    .run();
}

export async function deleteGoldenPathConfig(env: Env, id: number): Promise<void> {
  const db = getDb(env.DB);
  await db.delete(goldenPathConfig).where(eq(goldenPathConfig.id, id)).run();
}

export async function createGoldenPathScope(
  env: Env,
  input: {
    title: string;
    description: string;
    infrastructure: string;
    hexColor: string;
    tagIds?: number[];
  },
): Promise<GoldenPathConfigScopeRow> {
  const db = getDb(env.DB);
  const now = new Date().toISOString();

  const [scope] = await db
    .insert(goldenPathConfigScopes)
    .values({
      title: input.title.trim(),
      description: input.description.trim(),
      infrastructure: input.infrastructure.trim(),
      hexColor: input.hexColor.trim(),
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (input.tagIds?.length) {
    await db.insert(goldenPathConfigTagMappings).values(
      Array.from(new Set(input.tagIds)).map((tagId) => ({
        scopeId: scope.id,
        tagId,
      })),
    );
  }

  return scope;
}

export async function updateGoldenPathScope(
  env: Env,
  id: number,
  input: {
    title: string;
    description: string;
    infrastructure: string;
    hexColor: string;
    tagIds?: number[];
  },
): Promise<void> {
  const db = getDb(env.DB);
  await db
    .update(goldenPathConfigScopes)
    .set({
      title: input.title.trim(),
      description: input.description.trim(),
      infrastructure: input.infrastructure.trim(),
      hexColor: input.hexColor.trim(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(goldenPathConfigScopes.id, id))
    .run();

  await db.delete(goldenPathConfigTagMappings).where(eq(goldenPathConfigTagMappings.scopeId, id)).run();

  if (input.tagIds?.length) {
    await db.insert(goldenPathConfigTagMappings).values(
      Array.from(new Set(input.tagIds)).map((tagId) => ({
        scopeId: id,
        tagId,
      })),
    );
  }
}

export async function deleteGoldenPathScope(env: Env, id: number): Promise<void> {
  const db = getDb(env.DB);
  await db.delete(goldenPathConfigScopes).where(eq(goldenPathConfigScopes.id, id)).run();
}

export async function createGoldenPathTag(
  env: Env,
  input: {
    name: string;
    description: string;
    hexColor: string;
    isActive?: boolean;
  },
): Promise<GoldenPathConfigTagDefinitionRow> {
  const db = getDb(env.DB);
  const now = new Date().toISOString();

  const [tag] = await db
    .insert(goldenPathConfigTagDefinitions)
    .values({
      name: input.name.trim(),
      description: input.description.trim(),
      hexColor: input.hexColor.trim(),
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return tag;
}

export async function updateGoldenPathTag(
  env: Env,
  id: number,
  input: {
    name: string;
    description: string;
    hexColor: string;
    isActive: boolean;
  },
): Promise<void> {
  const db = getDb(env.DB);
  await db
    .update(goldenPathConfigTagDefinitions)
    .set({
      name: input.name.trim(),
      description: input.description.trim(),
      hexColor: input.hexColor.trim(),
      isActive: input.isActive,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(goldenPathConfigTagDefinitions.id, id))
    .run();
}

export async function deleteGoldenPathTag(env: Env, id: number): Promise<void> {
  const db = getDb(env.DB);
  await db
    .update(goldenPathConfigTagDefinitions)
    .set({
      isActive: false,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(goldenPathConfigTagDefinitions.id, id))
    .run();
}

export async function buildGoldenPathGroupedDefaults(
  env: Env,
  filters: GoldenPathConfigFilters = {},
): Promise<GoldenPathGroupedDefaults> {
  const configs = await listGoldenPathConfigs(env, filters);
  const grouped = configs.reduce<Record<string, string[]>>((acc, config) => {
    const key = config.scope.title;
    if (!acc[key]) {
      acc[key] = [];
    }

    acc[key].push(config.rule);
    return acc;
  }, {});

  const sections = Object.entries(grouped)
    .map(([scope, rules]) => `${scope}: ${rules.join(" | ")}`)
    .join("\n");

  return {
    defaults: grouped,
    systemPrompt: sections
      ? `Cloudflare Worker Golden Path (dynamic):\n${sections}\n\n${GOLDEN_PATH_OUTPUT_DISCIPLINE}`
      : GOLDEN_PATH_OUTPUT_DISCIPLINE,
  };
}

export async function buildGoldenPathInstructions(
  env: Env,
  options?: {
    scopeTitles?: string[];
    infrastructures?: string[];
    customInstructions?: string | null;
  },
): Promise<string> {
  const configs = await listGoldenPathConfigs(env);
  const scopeTitles = new Set((options?.scopeTitles || []).map((value) => value.toLowerCase()));
  const infrastructures = new Set(
    (options?.infrastructures || []).map((value) => value.toLowerCase()),
  );

  const filtered = configs.filter((config) => {
    if (scopeTitles.size && !scopeTitles.has(config.scope.title.toLowerCase())) {
      return false;
    }

    if (
      infrastructures.size &&
      !infrastructures.has(config.scope.infrastructure.toLowerCase())
    ) {
      return false;
    }

    return true;
  });

  const grouped = filtered.reduce<Record<string, GoldenPathConfigView[]>>((acc, config) => {
    const key = config.scope.title;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(config);
    return acc;
  }, {});

  const sections = Object.entries(grouped)
    .map(([scope, items]) => {
      const rules = items.map((item) => `- ${item.rule}`).join("\n");
      return `${scope.toUpperCase()}\n${rules}`;
    })
    .join("\n\n");

  const custom = String(options?.customInstructions || "").trim();
  const base = [sections, GOLDEN_PATH_OUTPUT_DISCIPLINE].filter(Boolean).join("\n\n");
  return custom ? `${base}\n\nAdditional team constraints: ${custom}` : base;
}

export async function buildCodingAgentInstructions(
  env: Env,
  options?: {
    customInstructions?: string | null;
    scopeTitles?: string[];
    infrastructures?: string[];
  },
): Promise<string> {
  return buildGoldenPathInstructions(env, {
    customInstructions: options?.customInstructions,
    scopeTitles: options?.scopeTitles?.length
      ? options.scopeTitles
      : [...CODING_AGENT_SCOPE_TITLES],
    infrastructures: options?.infrastructures?.length
      ? options.infrastructures
      : [...CODING_AGENT_INFRASTRUCTURES],
  });
}
