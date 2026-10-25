// env.DB
import { text, integer, sqliteTable, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const learningAiPrReflections = sqliteTable('learning_ai_pr_reflections', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  insightId: text('insight_id').notNull(),
  priorInsightId: text('prior_insight_id'),
  priorPrId: text('prior_pr_id'),
  outcome: text('outcome', { enum: ['succeeded', 'failed', 'reverted'] }).notNull(),
  rootCause: text('root_cause'),
  recommendedAction: text('recommended_action', {
    enum: ['local_patch', 'template_escalation', 'block'],
  }),
  vectorSimilarityScore: text('vector_similarity_score'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (table) => ({
  insightIdx: index('ai_pr_reflections_insight_idx').on(table.insightId),
  outcomeIdx: index('ai_pr_reflections_outcome_idx').on(table.outcome),
}));

export type LearningAiPrReflection = typeof learningAiPrReflections.$inferSelect;
export type InsertLearningAiPrReflection = typeof learningAiPrReflections.$inferInsert;
