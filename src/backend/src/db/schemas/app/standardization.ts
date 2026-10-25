// env.DB
import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const standardizationRules = sqliteTable("standardization_rules", {
  id: text("id").primaryKey(),
  sourceRepo: text("source_repo").notNull().default("jmbish04/core-github-standardization"),
  filePath: text("file_path").notNull(),
  description: text("description"),
  relevantInfra: text("relevant_infra").notNull().default("[]"), // JSON array
  irrelevantInfra: text("irrelevant_infra").notNull().default("[]"), // JSON array
  aiInstructions: text("ai_instructions"),
  shouldOverwrite: integer("should_overwrite", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const standardizationItems = sqliteTable('standardization_items', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    title: text('title').notNull(),
    rule: text('rule').notNull(),
    timestampCreated: text('timestamp_created').notNull().default(sql`CURRENT_TIMESTAMP`),
    timestampModified: text('timestamp_modified').notNull().default(sql`CURRENT_TIMESTAMP`),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    timestampInactive: text('timestamp_inactive'),
});

export const standardizationTagDefinitions = sqliteTable('standardization_tag_definitions', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text('name').notNull(),
    description: text('description'),
    hexColor: text('hex_color').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
});

export const standardizationTagMappings = sqliteTable('standardization_tag_mappings', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    tagId: text('tag_id').notNull().references(() => standardizationTagDefinitions.id),
    standardizationItemId: text('standardization_item_id').notNull().references(() => standardizationItems.id)
});

export const repositorySecretDefaults = sqliteTable('repository_secret_defaults', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    secretName: text('secret_name').notNull().unique(),
    description: text('description'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const systemConfigDefinitions = sqliteTable('system_config_definitions', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    category: text('category').notNull(),
    configKey: text('config_key').notNull().unique(),
    label: text('label').notNull(),
    type: text('type').notNull(), // e.g. 'string', 'secret', etc.
    description: text('description'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const repoSyncConfigs = sqliteTable('repo_sync_configs', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    fileName: text('file_name').notNull(), // The path in core-github-standardization
    targetRepoPattern: text('target_repo_pattern').notNull().default('*'), // e.g. '*' or 'frontend-*'
    triggerEvents: text('trigger_events').notNull().default('["push", "pull_request"]'), // JSON array
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});
