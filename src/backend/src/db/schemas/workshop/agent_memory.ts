// env.DB
/**
 * @file schemas/workshop/agent_memory.ts
 * Stores memory chunks/contexts for the Workshop AI agents.
 */
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { workshopProjects } from "./projects";

export const workshopAgentMemory = sqliteTable("workshop_agent_memory", {
    id: text("id").primaryKey(), // UUID
    projectId: text("project_id")
        .notNull()
        .references(() => workshopProjects.id, { onDelete: "cascade" }),
    content: text("content").notNull(), // The text chunk
    vectorizeId: text("vectorize_id"), // Correlates to Vectorize index
    conflictStatus: text("conflict_status").default("none"), // none | conflict | resolved
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});
