import { sql } from 'drizzle-orm';
import { check, index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { projects } from './roadmap';

export const reverseEngineeringSnapshots = sqliteTable(
  'reverse_eng_snapshots',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    githubOwner: text('github_owner').notNull(),
    githubRepo: text('github_repo').notNull(),
    repoUrl: text('repo_url').notNull(),
    branch: text('branch').notNull().default('main'),
    frontendUrl: text('frontend_url'),
    resolvedPreviewUrl: text('resolved_preview_url'),
    status: text('status').notNull().default('pending'),
    title: text('title'),
    detectedStackJson: text('detected_stack_json'),
    previewResolutionJson: text('preview_resolution_json'),
    frontendAuthJson: text('frontend_auth_json'),
    requestedAuthJson: text('requested_auth_json'),
    screenshotUrlsJson: text('screenshot_urls_json'),
    prdMarkdown: text('prd_markdown'),
    epicsJson: text('epics_json'),
    userJourneysJson: text('user_journeys_json'),
    repoResearchJson: text('repo_research_json'),
    julesResearchJson: text('jules_research_json'),
    errorMessage: text('error_message'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    completedAt: text('completed_at'),
  },
  (table) => ({
    projectIdx: index('reverse_eng_snapshots_project_idx').on(table.projectId),
    repoIdx: index('reverse_eng_snapshots_repo_idx').on(table.githubOwner, table.githubRepo),
    statusIdx: index('reverse_eng_snapshots_status_idx').on(table.status),
    statusCheck: check(
      'reverse_eng_snapshots_status_check',
      sql`${table.status} in ('pending', 'running', 'awaiting_auth', 'complete', 'failed')`,
    ),
  }),
);

export const reverseEngineeringUx = sqliteTable(
  'reverse_eng_ux',
  {
    id: text('id').primaryKey(),
    snapshotId: text('snapshot_id')
      .notNull()
      .references(() => reverseEngineeringSnapshots.id, { onDelete: 'cascade' }),
    overallDescription: text('overall_description'),
    pageAnalysesJson: text('page_analyses_json'),
    screenshotGalleryJson: text('screenshot_gallery_json'),
    pageUserJourneysJson: text('page_user_journeys_json'),
    visionAnalysisJson: text('vision_analysis_json'),
    codeAnalysisJson: text('code_analysis_json'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    snapshotIdx: index('reverse_eng_ux_snapshot_idx').on(table.snapshotId),
  }),
);

export const reverseEngineeringBackend = sqliteTable(
  'reverse_eng_backend',
  {
    id: text('id').primaryKey(),
    snapshotId: text('snapshot_id')
      .notNull()
      .references(() => reverseEngineeringSnapshots.id, { onDelete: 'cascade' }),
    architectureMarkdown: text('architecture_markdown'),
    endpointInventoryJson: text('endpoint_inventory_json'),
    dataModelJson: text('data_model_json'),
    integrationsJson: text('integrations_json'),
    authModelJson: text('auth_model_json'),
    deploymentModelJson: text('deployment_model_json'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    snapshotIdx: index('reverse_eng_backend_snapshot_idx').on(table.snapshotId),
  }),
);

export const reverseEngineeringEvents = sqliteTable(
  'reverse_eng_events',
  {
    id: text('id').primaryKey(),
    snapshotId: text('snapshot_id')
      .notNull()
      .references(() => reverseEngineeringSnapshots.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    title: text('title'),
    message: text('message'),
    payloadJson: text('payload_json'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    snapshotIdx: index('reverse_eng_events_snapshot_idx').on(table.snapshotId),
    eventIdx: index('reverse_eng_events_event_idx').on(table.eventType),
  }),
);
