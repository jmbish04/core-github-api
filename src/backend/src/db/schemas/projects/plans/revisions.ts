import { integer, sqliteTable, text, index } from "drizzle-orm/sqlite-core";

export const planRevisions = sqliteTable("plan_revisions", {
    id: text("id").primaryKey(), // UUID
    planId: text("plan_id").notNull(), // Unique identifier to tie multiple revisions together
    julesSessionId: text("jules_session_id"), // Correlating session execution
    repoOwner: text("repo_owner"),
    repoName: text("repo_name"),
    revisionNumber: integer("revision_number").notNull().default(1),
    isFinal: integer("is_final", { mode: 'boolean' }).default(false),
    humanFeedback: text("human_feedback"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date())
}, (table) => ({
    planIdx: index("idx_plan_revisions_plan").on(table.planId),
    sessionIdx: index("idx_plan_revisions_session").on(table.julesSessionId)
}));

export type PlanRevision = typeof planRevisions.$inferSelect;
export type InsertPlanRevision = typeof planRevisions.$inferInsert;
