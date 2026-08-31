// env.DB
/**
 * @file schemas/workshop/task_logs.ts
 * Detailed execution logs for a specific UX run/task.
 */
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { workshopUxRuns } from "./ux_design_runs";

export const workshopUxTaskLogs = sqliteTable("workshop_ux_task_logs", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: text("run_id")
        .notNull()
        .references(() => workshopUxRuns.id, { onDelete: "cascade" }),
    taskName: text("task_name").notNull(),
    taskJson: text("task_json", { mode: 'json' }), // JSON serialized payload
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull()
});

export type UxTaskLog = typeof workshopUxTaskLogs.$inferSelect;
export type NewUxTaskLog = typeof workshopUxTaskLogs.$inferInsert;
