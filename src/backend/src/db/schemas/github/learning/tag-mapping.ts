/**
 * @file backend/src/db/schemas/github/learning/tag-mapping.ts
 * @description Many-to-many mapping between learning messages and tags.
 *
 * @module DB/Schemas/Learning
 */

import { sqliteTable, text, primaryKey, index } from "drizzle-orm/sqlite-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";

export const learningTagMapping = sqliteTable(
  "learning_tag_mapping",
  {
    messageId: text("message_id").notNull(),
    tagId: text("tag_id").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.messageId, table.tagId] }),
    tagIdx: index("idx_learning_tagmap_tag").on(table.tagId),
  })
);

export const selectLearningTagMappingSchema =
  createSelectSchema(learningTagMapping).openapi("LearningTagMapping");
export const insertLearningTagMappingSchema =
  createInsertSchema(learningTagMapping).openapi("InsertLearningTagMapping");
