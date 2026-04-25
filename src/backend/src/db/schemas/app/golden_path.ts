import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const goldenPathConfigScopes = sqliteTable(
  "golden_path_config_scopes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    infrastructure: text("infrastructure").notNull(),
    hexColor: text("hex_color").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    titleIdx: uniqueIndex("idx_golden_path_config_scopes_title").on(table.title),
  }),
);

export const goldenPathConfig = sqliteTable("golden_path_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  rule: text("rule").notNull(),
  scopeId: integer("scope_id")
    .notNull()
    .references(() => goldenPathConfigScopes.id, { onDelete: "cascade" }),
  /** Detection severity: info | warning | error | critical */
  severity: text("severity").notNull().default("warning"),
  /** Static detection pattern — string literal or regex. Null = AI-only evaluation. */
  pattern: text("pattern"),
  /** How to interpret the pattern field: 'string' (includes check) or 'regex'. */
  patternType: text("pattern_type").default("string"),
  /** Link to relevant Cloudflare or project documentation. */
  docsUrl: text("docs_url"),
  /** Toggle to enable/disable this rule instantly from the frontend. */
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const goldenPathConfigTagDefinitions = sqliteTable(
  "golden_path_config_tag_definitions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    hexColor: text("hex_color").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    nameIdx: uniqueIndex("idx_golden_path_config_tag_definitions_name").on(table.name),
  }),
);

export const goldenPathConfigTagMappings = sqliteTable("golden_path_config_tag_mappings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scopeId: integer("scope_id")
    .notNull()
    .references(() => goldenPathConfigScopes.id, { onDelete: "cascade" }),
  tagId: integer("tag_id")
    .notNull()
    .references(() => goldenPathConfigTagDefinitions.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type GoldenPathConfigScopeRow = typeof goldenPathConfigScopes.$inferSelect;
export type NewGoldenPathConfigScopeRow = typeof goldenPathConfigScopes.$inferInsert;
export type GoldenPathConfigRow = typeof goldenPathConfig.$inferSelect;
export type NewGoldenPathConfigRow = typeof goldenPathConfig.$inferInsert;
export type GoldenPathConfigTagDefinitionRow = typeof goldenPathConfigTagDefinitions.$inferSelect;
export type NewGoldenPathConfigTagDefinitionRow = typeof goldenPathConfigTagDefinitions.$inferInsert;
export type GoldenPathConfigTagMappingRow = typeof goldenPathConfigTagMappings.$inferSelect;
export type NewGoldenPathConfigTagMappingRow = typeof goldenPathConfigTagMappings.$inferInsert;
