/**
 * @file golden-path-seed.ts
 * @description Seed data for golden_path_config tables.
 *
 * Converts the original static patterns from GuardrailAgent/methods/cloudflare-docs.ts
 * into database rows so they become self-service and frontend-configurable.
 *
 * Usage from drizzle seed or a one-time API call:
 *   import { seedGoldenPathDefaults } from './golden-path-seed';
 *   await seedGoldenPathDefaults(env);
 */

import { getDb } from "@db";
import { eq } from "drizzle-orm";
import {
  goldenPathConfig,
  goldenPathConfigScopes,
  goldenPathConfigTagDefinitions,
  goldenPathConfigTagMappings,
} from "@db/schemas/app/golden_path";

// ── Tag definitions ──────────────────────────────────────────────────────────

const TAGS = [
  { 
    name: "agents-sdk", 
    description: "Cloudflare Agents SDK patterns and best practices", 
    hexColor: "#3b82f6" 
  },
  { 
    name: "ai-gateway", 
    description: "AI Gateway routing, caching, and observability", 
    hexColor: "#8b5cf6" 
  },
  { 
    name: "durable-objects", 
    description: "Durable Object lifecycle, state, and migration patterns", 
    hexColor: "#f59e0b" 
  },
  { 
    name: "legacy-purge", 
    description: "Detection of deprecated patterns that must be removed", 
    hexColor: "#ef4444" 
  },
  { 
    name: "workers", 
    description: "Cloudflare Workers runtime constraints and patterns", 
    hexColor: "#06b6d4" 
  },
  { 
    name: "security", 
    description: "Security best practices for Workers platform", 
    hexColor: "#ec4899" 
  },
] as const;

// ── Scope definitions ────────────────────────────────────────────────────────

const SCOPES = [
  {
    title: "Agents SDK",
    description: "Rules enforcing correct usage of the Cloudflare Agents SDK (@cloudflare/agents, agents package).",
    infrastructure: "cloudflare",
    hexColor: "#3b82f6",
    tagNames: ["agents-sdk", "durable-objects"],
  },
  {
    title: "AI & Inference",
    description: "Rules for AI Gateway routing, model invocation, and observability.",
    infrastructure: "cloudflare",
    hexColor: "#8b5cf6",
    tagNames: ["ai-gateway", "workers"],
  },
  {
    title: "Legacy Cleanup",
    description: "Rules detecting deprecated patterns (HoniClient, raw DO fetch) that must be purged.",
    infrastructure: "coding-agent",
    hexColor: "#ef4444",
    tagNames: ["legacy-purge", "agents-sdk"],
  },
  {
    title: "Infrastructure",
    description: "Wrangler config, migration, and deployment rules.",
    infrastructure: "workers",
    hexColor: "#f59e0b",
    tagNames: ["durable-objects", "workers"],
  },
] as const;

// ── Config rules (migrated from static cloudflare-docs.ts) ───────────────────

interface SeedRule {
  title: string;
  description: string;
  rule: string;
  scopeTitle: string;
  severity: "info" | "warning" | "error" | "critical";
  pattern: string | null;
  patternType: "string" | "regex";
  docsUrl: string | null;
}

const RULES: SeedRule[] = [
  {
    title: "No Raw DO Instantiation",
    description: "Raw DO instantiation detected. Use getAgentByName() from the Agents SDK instead.",
    rule: "Never use env.NAMESPACE.idFromName() followed by .get() for Agent routing. Always use getAgentByName() or routeAgentRequest() from the agents package.",
    scopeTitle: "Agents SDK",
    severity: "critical",
    pattern: "idFromName",
    patternType: "string",
    docsUrl: "https://developers.cloudflare.com/agents/api-reference/agents-api/",
  },
  {
    title: "AI Gateway Routing Required",
    description: "Direct env.AI.run() call without AI Gateway routing. Route through AI Gateway for observability.",
    rule: "All AI inference calls must be routed through Cloudflare AI Gateway for unified observability, caching, and fallback logic. Format model identifiers as ${provider}/${model}.",
    scopeTitle: "AI & Inference",
    severity: "warning",
    pattern: "env.AI.run(",
    patternType: "string",
    docsUrl: "https://developers.cloudflare.com/ai-gateway/",
  },
  {
    title: "Agents Require SQLite Classes",
    description: "Agent classes extending Agent/AIChatAgent MUST use new_sqlite_classes, not new_classes in wrangler migrations.",
    rule: "Any class extending Agent from @cloudflare/agents REQUIRES new_sqlite_classes in the migrations array. Using new_classes causes runtime errors: 'SQLite storage not available.'",
    scopeTitle: "Infrastructure",
    severity: "critical",
    pattern: "\"new_classes\"",
    patternType: "string",
    docsUrl: "https://developers.cloudflare.com/agents/configuration/",
  },
  {
    title: "No Legacy HoniClient",
    description: "Legacy HoniClient reference detected. Use Agents SDK patterns (getAgentByName, @callable).",
    rule: "HoniClient and @utils/honi-client are deprecated. All agent communication must use the official Agents SDK: getAgentByName() for RPC, @callable() for method registration, routeAgentRequest() for HTTP/WS routing.",
    scopeTitle: "Legacy Cleanup",
    severity: "error",
    pattern: "HoniClient",
    patternType: "string",
    docsUrl: null,
  },
  {
    title: "No honi-client Imports",
    description: "Legacy honi-client import detected. Use Agents SDK patterns.",
    rule: "The honi-client module is fully deprecated. Replace all imports with direct Agents SDK usage.",
    scopeTitle: "Legacy Cleanup",
    severity: "error",
    pattern: "honi-client",
    patternType: "string",
    docsUrl: null,
  },
  {
    title: "No Manual DO fetch()",
    description: "Manual fetch() to a Durable Object detected. Use @callable() RPC methods instead.",
    rule: "Never construct HTTP or WebSocket upgrade requests manually to talk to a Durable Object. Use @callable() RPC methods or routeAgentRequest() for all DO communication.",
    scopeTitle: "Agents SDK",
    severity: "error",
    pattern: "\\.fetch\\(\\s*[\"']http:\\/\\/[a-z-]+\\/",
    patternType: "regex",
    docsUrl: "https://developers.cloudflare.com/agents/api-reference/agents-api/#callable",
  },
  {
    title: "No Env Imports",
    description: "Do not import Env from worker-configuration. Env is a global type via wrangler types.",
    rule: "The Env interface is automatically augmented by wrangler types into worker-configuration.d.ts and made global via tsconfig.json. Never import it manually.",
    scopeTitle: "Infrastructure",
    severity: "error",
    pattern: "from.*worker-configuration",
    patternType: "regex",
    docsUrl: null,
  },
  {
    title: "No Deep Relative Imports",
    description: "Deep relative imports detected (>2 levels). Use path aliases (@/, @db/, etc.).",
    rule: "Always use defined path aliases for cross-module imports. @/* maps to src/, @db/* maps to the Drizzle data layer, @ui/* maps to the Shadcn component registry.",
    scopeTitle: "Infrastructure",
    severity: "warning",
    pattern: "from\\s+[\"'](?:\\.\\.\\/){3,}",
    patternType: "regex",
    docsUrl: null,
  },
  {
    title: "No npx Usage",
    description: "Use 'pnpm dlx' instead of 'npx' per workspace standards.",
    rule: "Never use npx. Always use pnpm dlx wrangler@latest for Cloudflare CLI interactions. Use pnpm exec for locally installed binaries.",
    scopeTitle: "Infrastructure",
    severity: "warning",
    pattern: "npx ",
    patternType: "string",
    docsUrl: null,
  },
  {
    title: "No Database in Frontend",
    description: "Database imports detected in frontend code. Database access must stay in backend/.",
    rule: "The frontend/ directory is strictly forbidden from importing drizzle-orm, drizzle-kit, or any direct database drivers. All data fetching must go through the Hono RPC client.",
    scopeTitle: "Infrastructure",
    severity: "critical",
    pattern: "from\\s+[\"']drizzle",
    patternType: "regex",
    docsUrl: null,
  },
  {
    title: "Astro Cloudflare Unified Platform Proxy",
    description: "Astro frontend configuration must explicitly link to root wrangler.jsonc for platform proxy.",
    rule: "In a unified backend/frontend monolithic worker with Astro, the @astrojs/cloudflare adapter must configure platformProxy.configPath to point to the root wrangler.jsonc. Failure to do so causes Astro to guess the compatibility date and auto-generate duplicate proxy types.",
    scopeTitle: "Infrastructure",
    severity: "error",
    pattern: "adapter:\\s*cloudflare\\(\\s*\\{\\s*(?!.*platformProxy).*\\}\\s*\\)",
    patternType: "regex",
    docsUrl: "https://developers.cloudflare.com/pages/framework-guides/deploy-an-astro-site/",
  },
];

// ── Seeder ───────────────────────────────────────────────────────────────────

export async function seedGoldenPathDefaults(env: Env): Promise<{
  tags: number;
  scopes: number;
  rules: number;
}> {
  const db = getDb(env.DB);
  const now = new Date().toISOString();

  // 1. Upsert tag definitions
  const tagMap = new Map<string, number>();
  for (const tag of TAGS) {
    const existing = await db
      .select()
      .from(goldenPathConfigTagDefinitions)
      .where(eq(goldenPathConfigTagDefinitions.name, tag.name))
      .get();

    if (existing) {
      tagMap.set(tag.name, existing.id);
    } else {
      const [row] = await db
        .insert(goldenPathConfigTagDefinitions)
        .values({
          name: tag.name,
          description: tag.description,
          hexColor: tag.hexColor,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      tagMap.set(tag.name, row.id);
    }
  }

  // 2. Upsert scopes with tag mappings
  const scopeMap = new Map<string, number>();
  for (const scope of SCOPES) {
    const existing = await db
      .select()
      .from(goldenPathConfigScopes)
      .where(eq(goldenPathConfigScopes.title, scope.title))
      .get();

    let scopeId: number;
    if (existing) {
      scopeId = existing.id;
    } else {
      const [row] = await db
        .insert(goldenPathConfigScopes)
        .values({
          title: scope.title,
          description: scope.description,
          infrastructure: scope.infrastructure,
          hexColor: scope.hexColor,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      scopeId = row.id;
    }
    scopeMap.set(scope.title, scopeId);

    // Wire tag mappings
    for (const tagName of scope.tagNames) {
      const tagId = tagMap.get(tagName);
      if (tagId) {
        try {
          await db.insert(goldenPathConfigTagMappings).values({
            scopeId,
            tagId,
            createdAt: now,
          });
        } catch {
          // Duplicate — already mapped
        }
      }
    }
  }

  // 3. Upsert config rules
  let rulesCreated = 0;
  for (const rule of RULES) {
    const scopeId = scopeMap.get(rule.scopeTitle);
    if (!scopeId) continue;

    const existing = await db
      .select()
      .from(goldenPathConfig)
      .where(eq(goldenPathConfig.title, rule.title))
      .get();

    if (!existing) {
      await db.insert(goldenPathConfig).values({
        title: rule.title,
        description: rule.description,
        rule: rule.rule,
        scopeId,
        severity: rule.severity,
        pattern: rule.pattern,
        patternType: rule.patternType,
        docsUrl: rule.docsUrl,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      rulesCreated++;
    }
  }

  return {
    tags: TAGS.length,
    scopes: SCOPES.length,
    rules: rulesCreated,
  };
}
