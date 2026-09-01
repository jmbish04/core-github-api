// env.DB
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const pullRequests = sqliteTable('pull_requests', {
  id: integer('id').primaryKey(), // GitHub PR ID
  number: integer('number').notNull(),
  repoOwner: text('repo_owner').notNull(),
  repoName: text('repo_name').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  state: text('state').notNull(), // open, closed, merged
  author: text('author').notNull(),
  authorAvatar: text('author_avatar'),
  htmlUrl: text('html_url').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
    numberIdx: index('pull_requests_number_idx').on(table.repoOwner, table.repoName, table.number)
}));

export const prComments = sqliteTable('pr_comments', {
  id: integer('id').primaryKey(), // GitHub Comment ID
  prNumber: integer('pr_number').notNull(),
  repoOwner: text('repo_owner').notNull(),
  repoName: text('repo_name').notNull(),
  type: text('type').notNull(), // 'standard' | 'code_review'
  author: text('author').notNull(),
  authorAvatar: text('author_avatar'),
  body: text('body').notNull(),
  path: text('path'), // Only for code review comments
  line: integer('line'), // Only for code review comments
  htmlUrl: text('html_url').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
    prIdx: index('pr_comments_pr_idx').on(table.repoOwner, table.repoName, table.prNumber)
}));
