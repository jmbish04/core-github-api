/**
 * @file backend/src/db/schemas/github/learning/tags.ts
 * @description Tag taxonomy for the Learning Engine. Maps to
 * the existing app/tags.ts categories where possible.
 *
 * @module DB/Schemas/Learning
 */

import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";

export const learningTags = sqliteTable("learning_tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const selectLearningTagSchema =
  createSelectSchema(learningTags).openapi("LearningTag");
export const insertLearningTagSchema =
  createInsertSchema(learningTags).openapi("InsertLearningTag");
