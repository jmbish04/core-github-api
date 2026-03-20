import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const agentSkills = sqliteTable('agent_skills', {
  id: text('id').primaryKey(), // We use uuid as strings
  name: text('name').notNull(),
  description: text('description').notNull(),
  markdownContent: text('markdown_content').notNull(),
  githubPath: text('github_path'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});
