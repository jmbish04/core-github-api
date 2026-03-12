import { sql } from "drizzle-orm";
import { check, index, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const projectPlanningRequests = sqliteTable(
  "planning_requests",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id"),
    projectName: text("project_name"),
    workstream: text("workstream").notNull(),
    status: text("status").notNull().default("queued"),
    prompt: text("prompt").notNull(),
    githubRepo: text("github_repo"),
    baseBranch: text("base_branch").default("main"),
    stitchProjectId: text("stitch_project_id"),
    stitchScreenIdsJson: text("stitch_screen_ids_json"),
    julesSessionId: text("jules_session_id"),
    workflowInstanceId: text("workflow_instance_id"),
    r2PlanKey: text("r2_plan_key"),
    vectorizeIndexId: text("vectorize_index_id"),
    approvedBy: text("approved_by"),
    approvedAt: text("approved_at"),
    completedAt: text("completed_at"),
    errorMessage: text("error_message"),
    metadataJson: text("metadata_json"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    workstreamIdx: index("planning_requests_workstream_idx").on(table.workstream),
    statusIdx: index("planning_requests_status_idx").on(table.status),
    projectIdx: index("planning_requests_project_idx").on(table.projectId),
    sessionIdx: index("planning_requests_session_idx").on(table.julesSessionId),
    workflowIdx: index("planning_requests_workflow_idx").on(table.workflowInstanceId),
    workstreamCheck: check(
      "planning_requests_workstream_check",
      sql`${table.workstream} in ('api_request', 'project_planning', 'integration_stitch', 'stitch_implementation')`,
    ),
    statusCheck: check(
      "planning_requests_status_check",
      sql`${table.status} in ('queued', 'running', 'awaiting_stitch_approval', 'awaiting_plan_approval', 'approved', 'revising', 'orchestrating', 'implementing', 'completed', 'rejected', 'failed', 'cancelled')`,
    ),
  }),
);

export type ProjectPlanningRequest = typeof projectPlanningRequests.$inferSelect;
export type InsertProjectPlanningRequest = typeof projectPlanningRequests.$inferInsert;
