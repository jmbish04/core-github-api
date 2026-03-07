import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const goldenPathConfig = sqliteTable("golden_path_config", {
  id: text("id").primaryKey(), // We'll just use 'default' 
  frontend: text("frontend", { mode: "json" }).notNull(), // Assuming string[]
  backend: text("backend", { mode: "json" }).notNull(),
  ai: text("ai", { mode: "json" }).notNull(),
  infra: text("infra", { mode: "json" }).notNull(),
  docs: text("docs", { mode: "json" }).notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type GoldenPathConfigRow = typeof goldenPathConfig.$inferSelect;
export type NewGoldenPathConfigRow = typeof goldenPathConfig.$inferInsert;
