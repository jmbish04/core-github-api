import {
    sqliteTable,
    text,
    integer,
    index
} from "drizzle-orm/sqlite-core";
import { repositories } from "@/db/schemas/github/repos";
import { planRevisions } from "../plans/revisions";

export const phases = sqliteTable("phases", {
    id: text("id").primaryKey(), // UUID
    repoId: text("repo_id")
        .notNull()
        .references(() => repositories.id, { onDelete: "cascade" }),
    planRevisionId: text("plan_revision_id")
        .references(() => planRevisions.id, { onDelete: "set null" }), 
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").$type<"todo" | "in_progress" | "done" | "backlog">().default("todo"),
    startDate: integer("start_date", { mode: 'timestamp' }),
    endDate: integer("end_date", { mode: 'timestamp' }),
    createdAt: integer("created_at", { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => ({
    repoIdx: index("idx_phases_repo").on(table.repoId),
    planRevisionIdx: index("idx_phases_revision").on(table.planRevisionId)
}));

export type Phase = typeof phases.$inferSelect;
export type InsertPhase = typeof phases.$inferInsert;
