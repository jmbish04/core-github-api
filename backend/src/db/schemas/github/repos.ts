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

// ----------------------
// repo_infra
// ----------------------

// ----------------------
// repo_ai_context
// ----------------------

// ----------------------
// repo_tags
// ----------------------
