/**
 * @file schemas/workshop/task_events.ts
 * Audit event log for Workshop project & task actions.
 * Distinct from the GitHub Kanban `task_events` table in projects/tasks.ts.
 */
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { workshopProjects } from "../workshop/projects";
import { workshopProjectTasks } from "../workshop/project_tasks";

export const workshopTaskEvents = sqliteTable("workshop_task_events", {
    id: text("id").primaryKey(), // UUID
    projectId: text("project_id")
        .notNull()
        .references(() => workshopProjects.id, { onDelete: "cascade" }),
    taskId: text("task_id")
        .references(() => workshopProjectTasks.id, { onDelete: "set null" }), // Optional correlation
    type: text("type").notNull(), // prompt | webhook | review | system | decision_required
    actor: text("actor").notNull(), // agent name or 'user'
    content: text("content", { mode: 'json' }), // JSON-serialized payload
    status: text("status").default("pending"), // pending | blocked | approved | rejected
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});
