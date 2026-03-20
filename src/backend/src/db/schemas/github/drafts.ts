/**
 * @file src/db/schema-drafts.ts
 * @description Drizzle schema for Repo Drafts (HIL Project Settings).
 */

import {
    sqliteTable,
    text,
    integer,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Repo Drafts Table
// Stores pending project/repo settings for Human-in-the-Loop approval.
export const repoDrafts = sqliteTable("repo_drafts", {
    id: text("id").primaryKey(), // UUID

    // Draft Fields (that will eventually populate repositories table)
    name: text("name").notNull(),
    description: text("description"),
    visibility: text("visibility").default("private"),

    infraType: text("infra_type"), // "worker", "pages", "python", etc.
    frontendConfig: text("frontend_config"), // JSON: { type: "react", framework: "vite" }

    // Status
    status: text("status").default("draft"), // draft, approved, rejected

    // HIL / AI Context
    aiGeneratedProposal: text("ai_generated_proposal"), // JSON or Markdown of what AI suggests
    userAdjustments: text("user_adjustments"), // JSON of user overrides

    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});
