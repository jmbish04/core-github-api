// env.DB
import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const projectPlanningRequests = sqliteTable(
  "planning_requests",
  {
    id: text("id").primaryKey(),
    title: text("title"),
    projectId: text("project_id"),
    projectName: text("project_name"),
    workstream: text("workstream").notNull(),
    status: text("status").notNull().default("queued"),
    prompt: text("prompt").notNull(),
    sourceContextJson: text("source_context_json"),
    githubRepo: text("github_repo"),
    baseBranch: text("base_branch").default("main"),
    stitchProjectId: text("stitch_project_id"),
    stitchScreenIdsJson: text("stitch_screen_ids_json"),
    requiresPlanApproval: integer("requires_plan_approval", {
      mode: "boolean",
    }).notNull().default(true),
    autoOrchestrate: integer("auto_orchestrate", {
      mode: "boolean",
    }).notNull().default(true),
    autoImplement: integer("auto_implement", {
      mode: "boolean",
    }).notNull().default(false),
    julesSessionId: text("jules_session_id"),
    workflowInstanceId: text("workflow_instance_id"),
    latestPlanArtifactId: text("latest_plan_artifact_id"),
    r2PlanKey: text("r2_plan_key"),
    vectorizeIndexId: text("vectorize_index_id"),
    createdBy: text("created_by"),
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

export const planningRequestEvents = sqliteTable(
  "planning_request_events",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull(),
    source: text("source").notNull(),
    eventType: text("event_type").notNull(),
    title: text("title"),
    message: text("message"),
    payloadJson: text("payload_json"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    requestIdx: index("planning_request_events_request_idx").on(table.requestId),
    sourceIdx: index("planning_request_events_source_idx").on(table.source),
    typeIdx: index("planning_request_events_type_idx").on(table.eventType),
    createdIdx: index("planning_request_events_created_idx").on(table.createdAt),
  }),
);

export const planningRequestArtifacts = sqliteTable(
  "planning_request_artifacts",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull(),
    artifactKind: text("artifact_kind").notNull(),
    storageDriver: text("storage_driver").notNull(),
    storageKey: text("storage_key"),
    mimeType: text("mime_type"),
    contentText: text("content_text"),
    metadataJson: text("metadata_json"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    requestIdx: index("planning_request_artifacts_request_idx").on(table.requestId),
    kindIdx: index("planning_request_artifacts_kind_idx").on(table.artifactKind),
    driverIdx: index("planning_request_artifacts_driver_idx").on(table.storageDriver),
    createdIdx: index("planning_request_artifacts_created_idx").on(table.createdAt),
  }),
);

export type PlanningRequestEvent = typeof planningRequestEvents.$inferSelect;
export type InsertPlanningRequestEvent = typeof planningRequestEvents.$inferInsert;
export type PlanningRequestArtifact = typeof planningRequestArtifacts.$inferSelect;
export type InsertPlanningRequestArtifact = typeof planningRequestArtifacts.$inferInsert;
