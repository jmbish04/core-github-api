// env.DB
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const userSettings = sqliteTable(
  "user_settings",
  {
    userId: text("user_id").primaryKey(),
    preferredProvider: text("preferred_provider").notNull().default("worker-ai"),
    preferredModel: text("preferred_model")
      .notNull()
      .default("@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
    enforceGoldenPath: integer("enforce_golden_path").notNull().default(1),
    customInstructions: text("custom_instructions"),
    goldenPathOverridesJson: text("golden_path_overrides_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    providerIdx: index("idx_user_settings_provider").on(table.preferredProvider),
  }),
);

export const organizationSettings = sqliteTable(
  "organization_settings",
  {
    organizationId: text("organization_id").primaryKey(),
    displayName: text("display_name"),
    preferredProvider: text("preferred_provider").notNull().default("worker-ai"),
    preferredModel: text("preferred_model")
      .notNull()
      .default("@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
    enforceGoldenPath: integer("enforce_golden_path").notNull().default(1),
    customInstructions: text("custom_instructions"),
    goldenPathOverridesJson: text("golden_path_overrides_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    providerIdx: index("idx_org_settings_provider").on(table.preferredProvider),
  }),
);

