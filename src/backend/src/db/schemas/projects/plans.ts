import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export type ProjectPlanItemType = "epic" | "story" | "task";
export type ProjectPlanStatus = "todo" | "in_progress" | "blocked" | "done";
export type ProjectPlanPriority = "low" | "medium" | "high" | "critical";

// Hierarchical plan storage for Epic -> Story -> Task trees.
export const projectPlans = sqliteTable(
  "project_plans",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    parentId: text("parent_id"),
    itemType: text("item_type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("todo"),
    priority: text("priority").notNull().default("medium"),
    assignee: text("assignee"),
    orderIndex: integer("order_index").notNull().default(0),
    metadataJson: text("metadata_json"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    projectIdx: index("idx_project_plans_project").on(table.projectId),
    parentIdx: index("idx_project_plans_parent").on(table.parentId),
    typeStatusIdx: index("idx_project_plans_type_status").on(table.itemType, table.status),
    typeCheck: check(
      "project_plans_item_type_check",
      sql`${table.itemType} in ('epic', 'story', 'task')`,
    ),
    statusCheck: check(
      "project_plans_status_check",
      sql`${table.status} in ('todo', 'in_progress', 'blocked', 'done')`,
    ),
    priorityCheck: check(
      "project_plans_priority_check",
      sql`${table.priority} in ('low', 'medium', 'high', 'critical')`,
    ),
  }),
);

