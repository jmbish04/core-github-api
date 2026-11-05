// env.DB
/**
 * @file src/db/schema-repos.ts
 * @description Drizzle schema for Repositories and AI Metadata.
 * @owner AI-Builder
 */


import {
    sqliteTable,
    text,
    integer,
    real,
    primaryKey,
    check,
    index,
} from "drizzle-orm/sqlite-core";

import { sql } from "drizzle-orm";

// ----------------------
// repositories
// ----------------------
export const repositories = sqliteTable("repositories", {
    id: text("id").primaryKey(),                           // "github:env.GITHUB_OWNER/core-github-api"
    provider: text("provider").notNull(),                  // "github","gitlab","local"
    owner: text("owner").notNull(),                        // "env.GITHUB_OWNER"
    name: text("name").notNull(),                          // "core-github-api"
    slug: text("slug").notNull().unique(),                 // "github:env.GITHUB_OWNER/core-github-api"
    infrastructure: text("infrastructure"),                // "python_script", "cloudflare_workers", "vercel", etc.

    repoUrl: text("repo_url").notNull(),                   // https://github.com/...
    homepageUrl: text("homepage_url"),                     // demo/docs if any

    description: text("description"),
    topicsJson: text("topics_json"),                       // JSON: ["cloudflare","workers","mcp"]
    visibility: text("visibility").notNull(),              // "public","private","internal"

    // Gardener Fields
    fingerprintJson: text("fingerprint_json"),             // JSON: Stack detection results
    lastAuditAt: text("last_audit_at"),                    // ISO8601

    lifecycleStage: text("lifecycle_stage"),               // "prototype","active","deprecated","archived"
    isTemplate: integer("is_template", { mode: "boolean" })
        .notNull()
        .default(false),
    criticality: integer("criticality")
        .notNull()
        .default(0),                                         // 0–10

    createdAt: text("created_at").notNull(),               // ISO8601 from provider
    updatedAt: text("updated_at").notNull(),
    lastScannedAt: text("last_scanned_at"),

    humanSummary: text("human_summary"),
    aiSummary: text("ai_summary"),
    notes: text("notes")
});


export const repos = repositories;
export type GitHubRepository = typeof repositories.$inferSelect;
export type NewGitHubRepository = typeof repositories.$inferInsert;


// ----------------------
// repo_tech_stack
// ----------------------
export const repoTechStack = sqliteTable(
    "repo_tech_stack",
    {
        repoId: text("repo_id")
            .notNull()
            .references(() => repositories.id, { onDelete: "cascade" }),
        domain: text("domain").notNull(),                    // "frontend","backend","infra","testing","tooling"
        key: text("key").notNull(),                          // "framework","bundler","ui_primitives","components","styling"
        value: text("value").notNull(),                      // "react","vite","radix-ui","shadcn","tailwindcss"
        source: text("source")                               // "ai_detected","manual","package.json","wrangler"
    },
    (table) => ({
        pk: primaryKey({ columns: [table.repoId, table.domain, table.key] })
    })
);

// ----------------------
// repo_stats
// ----------------------
export const repoStats = sqliteTable(
    "repo_stats",
    {
        repoId: text("repo_id").primaryKey(),
        healthScore: integer("health_score"),
        openIssuesCount: integer("open_issues_count"),
        prsMergedThisWeek: integer("prs_merged_this_week"),
        lastUpdated: text("last_updated").default(sql`CURRENT_TIMESTAMP`)
    },
    (table) => ({
        healthScoreCheck: check("health_score_check", sql`${table.healthScore} BETWEEN 0 AND 100`)
    })
);

// ----------------------
// repo_metrics
// ----------------------
export const repoMetrics = sqliteTable("repo_metrics", {
    repoId: text("repo_id")
        .primaryKey()
        .references(() => repositories.id, { onDelete: "cascade" }),

    defaultBranch: text("default_branch"),

    openIssues: integer("open_issues"),
    openPrs: integer("open_prs"),
    stars: integer("stars"),
    forks: integer("forks"),

    locTotal: integer("loc_total"),
    locTypescript: integer("loc_typescript"),
    locJavascript: integer("loc_javascript"),
    locPython: integer("loc_python"),

    hasTests: integer("has_tests", { mode: "boolean" }).default(false),
    testFramework: text("test_framework"),                 // "vitest","jest","pytest"
    ciProvider: text("ci_provider"),                       // "github-actions","cloudflare","none"
    coveragePercent: real("coverage_percent"),

    lastCommitAt: text("last_commit_at"),
    lastReleaseTag: text("last_release_tag"),
    lastReleaseAt: text("last_release_at")
});

// ----------------------
// repo_infra
// ----------------------
export const repoInfra = sqliteTable("repo_infra", {
    repoId: text("repo_id")
        .primaryKey()
        .references(() => repositories.id, { onDelete: "cascade" }),

    provider: text("provider"),                             // "cloudflare","gcp","aws","mixed","unknown"

    usesWorkers: integer("uses_workers", { mode: "boolean" }).default(false),
    usesPages: integer("uses_pages", { mode: "boolean" }).default(false),
    usesD1: integer("uses_d1", { mode: "boolean" }).default(false),
    usesKv: integer("uses_kv", { mode: "boolean" }).default(false),
    usesR2: integer("uses_r2", { mode: "boolean" }).default(false),
    usesQueues: integer("uses_queues", { mode: "boolean" }).default(false),
    usesVectorize: integer("uses_vectorize", { mode: "boolean" }).default(false),

    wranglerPath: text("wrangler_path"),                   // "wrangler.toml" or nested path
    envsJson: text("envs_json")                            // JSON: env names, bindings, etc.
});

// ----------------------
// repo_ai_context
// ----------------------
export const repoAiContext = sqliteTable("repo_ai_context", {
    repoId: text("repo_id")
        .primaryKey()
        .references(() => repositories.id, { onDelete: "cascade" }),

    embeddingId: text("embedding_id"),                     // ID in Vectorize or other
    tokensEstimate: integer("tokens_estimate"),
    lastIndexedAt: text("last_indexed_at"),
    indexVersion: integer("index_version")
});

// ----------------------
// repo_tags
// ----------------------
export const repoTags = sqliteTable(
    "repo_tags",
    {
        repoId: text("repo_id")
            .notNull()
            .references(() => repositories.id, { onDelete: "cascade" }),
        tag: text("tag").notNull()
    },
    (table) => ({
        pk: primaryKey({ columns: [table.repoId, table.tag] })
    })
);

// ----------------------
// operation_logs (Gardener)
// ----------------------
export const operationLogs = sqliteTable("operation_logs", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    repoId: text("repo_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),

    actionType: text("action_type").notNull(),            // "standardization", "fix_worker_types", "comment_enrichment"
    status: text("status").notNull(),                     // "queued", "in_progress", "success", "failed", "skipped"

    prUrl: text("pr_url"),                                // URL of the PR created by the agent
    detailsJson: text("details_json"),                    // JSON log of specific fixes applied or errors

    createdAt: text("created_at").notNull(),
    completedAt: text("completed_at")
}, (table) => ({
    repoIdx: index("idx_operation_logs_repo").on(table.repoId),
    actionIdx: index("idx_operation_logs_action").on(table.actionType)
}));


