import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const retrofitThreads = sqliteTable('retrofit_threads', {
  id: text('id').primaryKey(), // UUID
  sourceRepo: text('source_repo').notNull(), // e.g., "owner/repo"
  destinationRepo: text('destination_repo'),
  status: text('status').default('drafting').notNull(), // drafting, reviewing, implementing, pr_review, completed
  julesSessionId: text('jules_session_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

export const retrofitMessages = sqliteTable('retrofit_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  threadId: text('thread_id').references(() => retrofitThreads.id).notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

export const retrofitPrompts = sqliteTable('retrofit_prompts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  threadId: text('thread_id').references(() => retrofitThreads.id).notNull(),
  versionNumber: integer('version_number').notNull(),
  promptContent: text('prompt_content').notNull(),
  previousPromptId: integer('previous_prompt_id'),
  messageId: integer('message_id').references(() => retrofitMessages.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

export const retrofitComments = sqliteTable('retrofit_comments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  draftPromptId: integer('draft_prompt_id').references(() => retrofitPrompts.id).notNull(),
  draftPromptVersion: integer('draft_prompt_version').notNull(),
  userComment: text('user_comment').notNull(),
  aiUpdatedLanguage: text('ai_updated_language'),
  resolved: integer('resolved', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});
