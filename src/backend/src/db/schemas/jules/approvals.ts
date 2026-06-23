import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { julesBuildAnalysis } from "./analysis";

export const julesApprovals = sqliteTable(
  "jules_approvals",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workflowId: text("workflow_id").notNull(),
    entityType: text("entity_type").notNull(), // e.g., 'build_analysis'
    entityId: text("entity_id").references(() => julesBuildAnalysis.id),
    proposedPayload: text("proposed_payload").notNull(), // JSON payload
    status: text("status", {
      enum: ["pending", "approved", "rejected", "expired"],
    })
      .notNull()
      .default("pending"),
    humanFeedback: text("human_feedback"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    statusIdx: index("jules_approvals_status_idx").on(table.status),
    workflowIdx: index("jules_approvals_workflow_idx").on(table.workflowId),
    entityIdx: index("jules_approvals_entity_idx").on(table.entityType, table.entityId),
  })
);

export type JulesApproval = typeof julesApprovals.$inferSelect;
export type InsertJulesApproval = typeof julesApprovals.$inferInsert;
