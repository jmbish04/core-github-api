import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const planningRequests = sqliteTable('planning_requests', {
  id: text('id').primaryKey(),
  timestamp: text('timestamp').notNull(),
  githubRepoOwner: text('github_repo_owner'),
  githubRepoName: text('github_repo_name'),
  originalPrompt: text('original_prompt').notNull(),
  upscaledPrompt: text('upscaled_prompt')
});

export const planningRequestsUpscaling = sqliteTable('planning_requests_upscaling', {
  id: text('id').primaryKey(),
  planningRequestId: text('planning_request_id').notNull().references(() => planningRequests.id),
  task: text('task').notNull(),
  details: text('details').notNull()
});

export const planResponses = sqliteTable('plan_responses', {
  id: text('id').primaryKey(),
  planningRequestId: text('planning_request_id').notNull().references(() => planningRequests.id),
  prompt: text('prompt').notNull(),
  response: text('response').notNull()
});

export const prReviewChecklists = sqliteTable('pr_review_checklists', {
  id: text('id').primaryKey(),
  planningRequestId: text('planning_request_id').notNull().references(() => planningRequests.id),
  prUrl: text('pr_url').notNull(),
  item: text('item').notNull(),
  status: text('status').notNull(), // PENDING, COMPLETE_PENDING_REVIEW, BLOCKED, VERIFIED
  iteration: integer('iteration').notNull() // max 5
});
