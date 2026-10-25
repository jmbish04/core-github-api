// env.DB
/**
 * @file schemas/workshop/projects.ts
 * Workshop module root entity — a user-initiated project that the
 * Workshop Wizard creates and the WorkshopAgent DO orchestrates.
 */
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const workshopProjects = sqliteTable("workshop_projects", {
    id: text("id").primaryKey(), // UUID
    name: text("name").notNull(),
    description: text("description"),
    repoUrl: text("repo_url"),
    status: text("status").default("draft"), // draft | active | completed
    draftData: text("draft_data", { mode: 'json' }), // JSON-serialized wizard draft state
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});
