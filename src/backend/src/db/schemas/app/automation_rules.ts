// env.DB
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const automationRules = sqliteTable("automation_rules", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  triggerEvent: text("trigger_event").notNull(), // e.g. "push"
  triggerAction: text("trigger_action"), // e.g. "opened"
  triggerBranch: text("trigger_branch"), // e.g. "main"
  workflow: text("workflow").notNull(), // e.g. "deploy-production"
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type AutomationRuleRow = typeof automationRules.$inferSelect;
export type NewAutomationRuleRow = typeof automationRules.$inferInsert;
