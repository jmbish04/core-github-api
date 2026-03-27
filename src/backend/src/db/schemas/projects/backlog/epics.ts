import {
    sqliteTable,
    text,
    integer,
    index
} from "drizzle-orm/sqlite-core";
import { repositories } from "@/db/schemas/github/repos";


// 1. Epics (High-level initiatives, replacing projects/projectPhases)
export const epics = sqliteTable("epics", {
    id: text("id").primaryKey(), // UUID
    repoId: text("repo_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").$type<"todo" | "in_progress" | "done" | "backlog">().default("todo"),
    priority: text("priority").$type<"low" | "medium" | "high" | "urgent">().default("medium"),
    createdAt: integer("created_at", { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => ({
    repoIdx: index("idx_epics_repo").on(table.repoId)
}));