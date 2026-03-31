/**
 * @file src/db/schema-webhooks.ts
 * @description Drizzle ORM schema for GitHub Webhooks database
 * @owner AI-Builder
 */

import { sqliteTable, text, integer, index, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// --- Common Metadata ---

export const webhookDeliveries = sqliteTable('webhook_deliveries', {
    id: text('id').primaryKey(), // UUID
    delivery_id: text('delivery_id').notNull().unique(),
    event: text('event').notNull(),
    action: text('action'),
    repo_full_name: text('repo_full_name'), // e.g. "jmbish04/core-github-api"
    signature_sha256: text('signature_sha256').notNull(),
    user_agent: text('user_agent'),
    content_type: text('content_type'),
    payload: text('payload', { mode: 'json' }).notNull(), // Full JSON payload for transparency
    summary_payload: text('summary_payload', { mode: 'json' }), // Zod-parsed summary (stripped spam URLs)
    hook_id: integer('hook_id'),
    installation_id: integer('installation_id'),
    installation_type: text('installation_type'),
    created_at: text('created_at').notNull(), // ISO timestamp
}, (table) => ({
    deliveryIdx: index('delivery_idx').on(table.delivery_id),
    eventIdx: index('event_idx').on(table.event),
    createdAtIndex: index('created_at_idx').on(table.created_at),
    repoIdx: index('repo_full_name_idx').on(table.repo_full_name),
}));

// --- Event Specific Tables ---

// Helper to define common columns + specific ones
const eventTable = (name: string, specificColumns: any) => {
    return sqliteTable(name, {
        id: integer('id').primaryKey({ autoIncrement: true }),
        delivery_id: text('delivery_id').notNull().references(() => webhookDeliveries.delivery_id),
        payload: text('payload', { mode: 'json' }).notNull(), // Full JSON payload
        ...specificColumns
    }, (table) => ({
        deliveryFkIdx: index(`${name}_delivery_idx`).on(table.delivery_id),
    }));
};

export const securityAdvisory = eventTable('security_advisory', {
    ghsa_id: text('ghsa_id'),
    summary: text('summary'),
    severity: text('severity'),
    published_at: text('published_at'),
    updated_at: text('updated_at'),
    withdrawn_at: text('withdrawn_at'),
});

export const codeScanningAlert = eventTable('code_scanning_alert', {
    alert_number: integer('alert_number'),
    alert_url: text('alert_url'),
    state: text('state'),
    resolution: text('resolution'),
    severity: text('severity'),
    rule_id: text('rule_id'),
    tool_name: text('tool_name'),
    created_at: text('created_at'),
});

export const checkRun = eventTable('check_run', {
    check_run_id: integer('check_run_id'),
    head_sha: text('head_sha'),
    status: text('status'),
    conclusion: text('conclusion'),
    started_at: text('started_at'),
    completed_at: text('completed_at'),
    app_id: integer('app_id'),
});

export const commitComment = eventTable('commit_comment', {
    comment_id: integer('comment_id'),
    commit_id: text('commit_id'),
    body: text('body'),
    position: integer('position'),
    line: integer('line'),
    path: text('path'),
    author_login: text('author_login'),
});

export const create = eventTable('create', {
    ref: text('ref'),
    ref_type: text('ref_type'),
    master_branch: text('master_branch'),
    pusher_type: text('pusher_type'),
    description: text('description'),
});

export const customProperty = eventTable('custom_property', {
    definition_id: integer('definition_id'),
    property_name: text('property_name'),
    value_type: text('value_type'),
    default_value: text('default_value'),
    required: integer('required', { mode: 'boolean' }),
});

export const customPropertyValues = eventTable('custom_property_values', {
    repository_id: integer('repository_id'),
    repository_name: text('repository_name'),
    organization_id: integer('organization_id'),
    new_values: text('new_values', { mode: 'json' }),
});

export const deleteEvent = eventTable('delete', {
    ref: text('ref'),
    ref_type: text('ref_type'),
    pusher_type: text('pusher_type'),
});

export const dependabotAlert = eventTable('dependabot_alert', {
    alert_number: integer('alert_number'),
    state: text('state'),
    dependency_package: text('dependency_package'),
    security_advisory_id: text('security_advisory_id'),
    severity: text('severity'),
    dismissed_reason: text('dismissed_reason'),
    dismissed_at: text('dismissed_at'),
});

export const dismissalRequestCodeScanning = eventTable('dismissal_request_code_scanning', {
    alert_number: integer('alert_number'),
    request_id: integer('request_id'),
    reason: text('reason'),
    requested_by: text('requested_by'),
});

export const dismissalRequestSecretScanning = eventTable('dismissal_request_secret_scanning', {
    alert_number: integer('alert_number'),
    request_id: integer('request_id'),
    reason: text('reason'),
    requested_by: text('requested_by'),
});

export const exemptionRequestPushRuleset = eventTable('exemption_request_push_ruleset', {
    request_id: integer('request_id'),
    ruleset_id: integer('ruleset_id'),
    ruleset_name: text('ruleset_name'),
    status: text('status'),
    requester_login: text('requester_login'),
});

export const exemptionRequestSecretScanning = eventTable('exemption_request_secret_scanning', {
    request_id: integer('request_id'),
    status: text('status'),
    resource_identifier: text('resource_identifier'),
    requester_login: text('requester_login'),
});

export const fork = eventTable('fork', {
    forkee_id: integer('forkee_id'),
    forkee_name: text('forkee_name'),
    forkee_full_name: text('forkee_full_name'),
    forkee_owner_login: text('forkee_owner_login'),
});

export const issueComment = eventTable('issue_comment', {
    issue_number: integer('issue_number'),
    comment_id: integer('comment_id'),
    action: text('action'),
    author_login: text('author_login'),
    body: text('body'),
});

export const issues = eventTable('issues', {
    issue_number: integer('issue_number'),
    title: text('title'),
    state: text('state'),
    author_login: text('author_login'),
    assignee_login: text('assignee_login'),
    milestone_id: integer('milestone_id'),
    created_at: text('created_at'),
    closed_at: text('closed_at'),
});

export const label = eventTable('label', {
    label_id: integer('label_id'),
    name: text('name'),
    color: text('color'),
    description: text('description'),
});

export const milestone = eventTable('milestone', {
    milestone_id: integer('milestone_id'),
    number: integer('number'),
    title: text('title'),
    state: text('state'),
    due_on: text('due_on'),
});

export const mergeQueueEntry = eventTable('merge_queue_entry', {
    queue_entry_id: text('queue_entry_id'),
    pr_number: integer('pr_number'),
    queue_position: integer('queue_position'),
    state: text('state'),
});

export const organizationCustomPropertyValues = eventTable('organization_custom_property_values', {
    organization_id: integer('organization_id'),
    repository_id: integer('repository_id'),
    property_name: text('property_name'),
    new_value: text('new_value'),
});

export const pullRequest = eventTable('pull_request', {
    pr_number: integer('pr_number'),
    title: text('title'),
    state: text('state'),
    head_ref: text('head_ref'),
    head_sha: text('head_sha'),
    base_ref: text('base_ref'),
    base_sha: text('base_sha'),
    merged: integer('merged', { mode: 'boolean' }),
    merged_at: text('merged_at'),
    author_login: text('author_login'),
    assignee_login: text('assignee_login'),
});

export const pullRequestReview = eventTable('pull_request_review', {
    review_id: integer('review_id'),
    pr_number: integer('pr_number'),
    state: text('state'),
    author_login: text('author_login'),
    submitted_at: text('submitted_at'),
    body: text('body'),
});

export const pullRequestReviewComment = eventTable('pull_request_review_comment', {
    comment_id: integer('comment_id'),
    pr_number: integer('pr_number'),
    review_id: integer('review_id'),
    commit_id: text('commit_id'),
    path: text('path'),
    line: integer('line'),
    body: text('body'),
    author_login: text('author_login'),
});

export const pullRequestReviewThread = eventTable('pull_request_review_thread', {
    thread_id: text('thread_id'),
    pr_number: integer('pr_number'),
    is_resolved: integer('is_resolved', { mode: 'boolean' }),
    author_login: text('author_login'),
});

export const push = eventTable('push', {
    ref: text('ref'),
    before_sha: text('before_sha'),
    after_sha: text('after_sha'),
    pusher_name: text('pusher_name'),
    head_commit_id: text('head_commit_id'),
    head_commit_message: text('head_commit_message'),
    size: integer('size'),
    distinct_size: integer('distinct_size'),
});

export const repository = eventTable('repository', {
    repository_id: integer('repository_id'),
    name: text('name'),
    full_name: text('full_name'),
    visibility: text('visibility'),
    owner_login: text('owner_login'),
    description: text('description'),
});

export const securityAndAnalysis = eventTable('security_and_analysis', {
    repository_id: integer('repository_id'),
    changes_from: text('changes_from', { mode: 'json' }),
});

export const secretScanningAlert = eventTable('secret_scanning_alert', {
    alert_number: integer('alert_number'),
    secret_type: text('secret_type'),
    resolution: text('resolution'),
    state: text('state'),
    created_at: text('created_at'),
    resolved_at: text('resolved_at'),
});

export const secretScanningAlertLocation = eventTable('secret_scanning_alert_location', {
    alert_number: integer('alert_number'),
    location_type: text('location_type'),
    commit_sha: text('commit_sha'),
    start_line: integer('start_line'),
    end_line: integer('end_line'),
});

export const secretScanningScan = eventTable('secret_scanning_scan', {
    type: text('type'),
    status: text('status'),
    completed_at: text('completed_at'),
    secret_types_count: integer('secret_types_count'),
});

export const star = eventTable('star', {
    starred_at: text('starred_at'),
    repository_id: integer('repository_id'),
    sender_login: text('sender_login'),
});

export const status = eventTable('status', {
    sha: text('sha'),
    state: text('state'),
    context: text('context'),
    description: text('description'),
    target_url: text('target_url'),
    commit_url: text('commit_url'),
});

export const watch = eventTable('watch', {
    repository_id: integer('repository_id'),
    sender_login: text('sender_login'),
    action: text('action'),
});

export const workflowDispatch = eventTable('workflow_dispatch', {
    workflow: text('workflow'),
    ref: text('ref'),
    sender_login: text('sender_login'),
    inputs: text('inputs', { mode: 'json' }),
});

export const workflowJob = eventTable('workflow_job', {
    job_id: integer('job_id'),
    run_id: integer('run_id'),
    workflow_name: text('workflow_name'),
    status: text('status'),
    conclusion: text('conclusion'),
    started_at: text('started_at'),
    completed_at: text('completed_at'),
    runner_group_name: text('runner_group_name'),
});

export const workflowRun = eventTable('workflow_run', {
    run_id: integer('run_id'),
    workflow_id: integer('workflow_id'),
    workflow_name: text('workflow_name'),
    head_branch: text('head_branch'),
    head_sha: text('head_sha'),
    status: text('status'),
    conclusion: text('conclusion'),
    event: text('event'),
    run_attempt: integer('run_attempt'),
});

export const orgBlock = eventTable('org_block', {
    blocked_user_login: text('blocked_user_login'),
    blocked_reason: text('blocked_reason'),
});

export const repositoryAdvisory = eventTable('repository_advisory', {
    ghsa_id: text('ghsa_id'),
    summary: text('summary'),
    severity: text('severity'),
    state: text('state'),
    published_at: text('published_at'),
});

export const subIssues = eventTable('sub_issues', {
    parent_issue_id: integer('parent_issue_id'),
    sub_issue_id: integer('sub_issue_id'),
    sub_issue_title: text('sub_issue_title'),
    parent_issue_title: text('parent_issue_title'),
});

// ----------------------
// searches (Workflow)
// ----------------------
export const searches = sqliteTable("searches", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: text("session_id").notNull(),
    searchTerm: text("search_term").notNull(),
    status: text("status", { enum: ["pending", "processing", "completed", "failed"] })
        .default("pending")
        .notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
        .default(sql`(strftime('%s', 'now'))`)
        .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
        .default(sql`(strftime('%s', 'now'))`)
        .$onUpdate(() => new Date())
});

// ----------------------
// repo_analysis (Workflow Results)
// ----------------------
export const repoAnalysis = sqliteTable("repo_analysis", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    searchId: integer("search_id")
        .references(() => searches.id) // Foreign key to searches
        .notNull(),
    sessionId: text("session_id").notNull(),
    repoFullName: text("repo_full_name").notNull(),
    repoUrl: text("repo_url").notNull(),
    description: text("description"),
    // AI specific fields
    relevancyScore: real("relevancy_score").notNull(),
    reasoning: text("reasoning"),
    createdAt: integer("created_at", { mode: "timestamp" })
        .default(sql`(strftime('%s', 'now'))`)
        .notNull()
});

export type SelectSearch = typeof searches.$inferSelect;
export type InsertSearch = typeof searches.$inferInsert;
export type SelectRepoAnalysis = typeof repoAnalysis.$inferSelect;
export type InsertRepoAnalysis = typeof repoAnalysis.$inferInsert;

export const dailyTrends = sqliteTable(
  "daily_trends",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(), // ISO Date
    trendSummary: text("trend_summary").notNull(),
    topPicks: text("top_picks", { mode: "json" }).notNull(), // JSON: CuratedRepo[]
    sentInEmail: integer("sent_in_email", { mode: "boolean" }).default(false).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({
    dateIdx: index("daily_trends_date_idx").on(t.date),
  })
);

export const researchJudgeLogs = sqliteTable(
  "research_judge_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    query: text("query").notNull(),
    isRelevant: integer("is_relevant", { mode: "boolean" }).notNull(),
    aiFeatures: text("ai_features", { mode: "json" }).notNull(), // string[]
    summary: text("summary").notNull(),
    confidenceScore: real("confidence_score").notNull(),
    createdAt: text("created_at").notNull(), // ISO
  }
);

export const trendingRepos = sqliteTable(
  "trending_repos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionUuid: text("session_uuid").notNull(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    url: text("url").notNull().unique(),
    aiAnalysis: text("ai_analysis", { mode: "json" }), // JSON
    whyJustinInterested: text("why_justin_interested"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .default(sql`(strftime('%s', 'now'))`)
      .notNull(),
  },
  (t) => ({
    urlIdx: index("trending_repos_url_idx").on(t.url),
    createdAtIndex: index("trending_repos_created_at_idx").on(t.createdAt),
  })
);

export type InsertTrendingRepo = typeof trendingRepos.$inferInsert;
export type SelectTrendingRepo = typeof trendingRepos.$inferSelect;
