// env.DB
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const configAuditLogs = sqliteTable("config_audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changedBy: text("changed_by").default("system"), // Can be 'admin' or 'agent-id'
  category: text("category").notNull(),
  timestamp: text("timestamp").default(sql`CURRENT_TIMESTAMP`),
});

export type ConfigAuditLog = typeof configAuditLogs.$inferSelect;
export type NewConfigAuditLog = typeof configAuditLogs.$inferInsert;
