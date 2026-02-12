
import { integer, sqliteTable, text, index } from "drizzle-orm/sqlite-core";

export const julesSessions = sqliteTable(
  "jules_sessions",
  {
    id: text("id").primaryKey(), // Jules Session ID
    projectId: text("project_id"), // Optional project context
    prompt: text("prompt").notNull(),
    status: text("status", { enum: ['active', 'completed', 'failed', 'stuck', 'waiting_for_user'] }).notNull().default('active'),
    
    // Metadata
    repoOwner: text("repo_owner"),
    repoName: text("repo_name"),
    branch: text("branch"),
    
    // Tracking
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
    lastActivityAt: integer("last_activity_at", { mode: "timestamp" }).notNull(),
    
    // Overseer metrics
    assistanceCount: integer("assistance_count").default(0),
    requiresUserAttention: integer("requires_user_attention", { mode: "boolean" }).default(false),
    
    // JSON blobs for extra context
    metadataJson: text("metadata_json"),
  },
  (table) => ({
    statusIdx: index("jules_status_idx").on(table.status),
    projectIdx: index("jules_project_idx").on(table.projectId),
    createdIdx: index("jules_created_idx").on(table.createdAt),
    lastActivityIdx: index("jules_last_activity_idx").on(table.lastActivityAt),
  })
);

export type JulesSession = typeof julesSessions.$inferSelect;
export type InsertJulesSession = typeof julesSessions.$inferInsert;
