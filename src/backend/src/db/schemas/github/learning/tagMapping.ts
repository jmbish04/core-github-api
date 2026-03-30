import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { tags } from "../../app/tags";
import { learningMessages } from "./messages";

export const learningTagMapping = sqliteTable("learning_tag_mapping", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tagId: text("tag_id").references(() => tags.id),
  messageId: integer("message_id").references(() => learningMessages.id),
  rationale: text("rationale"),
});

export const selectLearningTagMappingSchema = createSelectSchema(learningTagMapping);
export const insertLearningTagMappingSchema = createInsertSchema(learningTagMapping);
