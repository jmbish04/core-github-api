import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { learningSessions } from "./sessions";

export const learningThreads = sqliteTable("learning_threads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id").references(() => learningSessions.id),
  timestamp: text("timestamp").notNull(),
  source: text("source", {
    enum: ["jules", "stitch", "github", "other", "github_pr", "github_comment"],
  }).notNull(),
  sourceIdentifier: text("source_identifier").notNull().unique(),
  githubRepo: text("github_repo"),
});

export const selectLearningThreadSchema = createSelectSchema(learningThreads);
export const insertLearningThreadSchema = createInsertSchema(learningThreads);
