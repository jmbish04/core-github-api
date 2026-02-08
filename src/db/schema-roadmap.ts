/**
 * @file src/db/schema-roadmap.ts
 * @description Drizzle schema for Project Roadmap and Phases.
 */

import {
    sqliteTable,
    text,
    integer,
    index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { repositories } from "./schema-repos";

// Projects Table
// A Project is a high-level initiative that groups phases and tasks.
// It is tied to a repository.
export const projects = sqliteTable("projects", {
    id: text("id").primaryKey(), // UUID
    repoId: text("repo_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").default("planning"), // planning, active, completed, on_hold, cancelled
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),

    // Links to other contexts
    owner: text("owner"), // User or Team
}, (table) => ({
    repoIdx: index("idx_projects_repo").on(table.repoId)
}));


// Project Phases Table
// A Phase is a specific stage of a Project (e.g., "Phase 1: Database Migration").
// It acts as an Epic.
export const projectPhases = sqliteTable("project_phases", {
    id: text("id").primaryKey(), // UUID
    projectId: text("project_id")
        .notNull()
        .references(() => projects.id, { onDelete: "cascade" }),

    name: text("name").notNull(),
    description: text("description"),
    status: text("status").default("pending"), // pending, in_progress, completed, blocked

    startDate: text("start_date"),
    endDate: text("end_date"),

    // AI Generated / Technical Fields
    successCriteria: text("success_criteria"), // Markdown
    technicalInstructions: text("technical_instructions"), // Markdown (AI synthesized)

    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
    projectIdx: index("idx_phases_project").on(table.projectId)
}));
