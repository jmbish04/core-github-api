import { sqliteTable, integer, text, index } from "drizzle-orm/sqlite-core";

export const prManagerJobs = sqliteTable(
  "pr_manager_jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    owner: text("owner").notNull(),
    repo: text("repo").notNull(),
    pullNumber: integer("pull_number").notNull(),
    status: text("status").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  }
);
