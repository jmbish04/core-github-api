import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";

export const learningSessions = sqliteTable("learning_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  timestamp: text("timestamp")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  actionTaken: integer("action_taken", { mode: "boolean" })
    .notNull()
    .default(false),
  actionRationale: text("action_rationale"),
});

export const selectLearningSessionSchema = createSelectSchema(learningSessions);
export const insertLearningSessionSchema = createInsertSchema(learningSessions);
