// env.DB
// env.DB
/**
 * @file backend/src/db/schema-pricing.ts
 * @description Database schema for AI model pricing snapshots
 * @owner AI Infrastructure Team
 */

import { sqliteTable, text, real, integer, index } from 'drizzle-orm/sqlite-core';

/**
 * Stores weekly snapshots of AI model pricing from various providers
 * Used to track pricing changes over time and detect stale data
 */
export const pricingSnapshots = sqliteTable(
  'pricing_snapshots',
  {
    id: text('id').primaryKey(), // UUID
    provider: text('provider', { enum: ['openai', 'anthropic', 'google', 'cloudflare'] }).notNull(),
    modelId: text('model_id').notNull(), // e.g., 'gpt-4o', 'claude-sonnet-4.5'
    modelName: text('model_name').notNull(), // Human-readable name

    // Base pricing (standard context)
    inputCostPerM: real('input_cost_per_m').notNull(), // Cost per 1M input tokens
    outputCostPerM: real('output_cost_per_m').notNull(), // Cost per 1M output tokens

    // Long context pricing (>200k tokens)
    inputLongCostPerM: real('input_long_cost_per_m'), // Nullable
    outputLongCostPerM: real('output_long_cost_per_m'), // Nullable

    // Caching costs
    cacheReadCostPerM: real('cache_read_cost_per_m'), // Nullable
    cacheWriteCostPerM: real('cache_write_cost_per_m'), // Nullable

    // Metadata
    metadata: text('metadata'), // JSON string for additional data
    sourceUrl: text('source_url').notNull(), // URL where pricing was scraped
    scrapedAt: integer('scraped_at', { mode: 'timestamp' }).notNull(), // Unix timestamp
  },
  (table) => ({
    providerIdx: index('pricing_provider_idx').on(table.provider),
    modelIdIdx: index('pricing_model_id_idx').on(table.modelId),
    scrapedAtIdx: index('pricing_scraped_at_idx').on(table.scrapedAt),
    providerModelIdx: index('pricing_provider_model_idx').on(table.provider, table.modelId),
  })
);

export type PricingSnapshot = typeof pricingSnapshots.$inferSelect;
export type NewPricingSnapshot = typeof pricingSnapshots.$inferInsert;

/**
 * Tracks changes to AI model pricing over time
 * Used to maintain a changelog of pricing fluctuations
 */
export const pricingChangeLog = sqliteTable(
  'pricing_change_log',
  {
    id: text('id').primaryKey(), // UUID
    provider: text('provider', { enum: ['openai', 'anthropic', 'google', 'cloudflare'] }).notNull(),
    modelId: text('model_id').notNull(),
    modelName: text('model_name').notNull(),

    // Change type
    changeType: text('change_type', { enum: ['new_model', 'price_increase', 'price_decrease', 'no_change'] }).notNull(),

    // Old pricing (null for new models)
    oldInputCostPerM: real('old_input_cost_per_m'),
    oldOutputCostPerM: real('old_output_cost_per_m'),
    oldInputLongCostPerM: real('old_input_long_cost_per_m'),
    oldOutputLongCostPerM: real('old_output_long_cost_per_m'),
    oldCacheReadCostPerM: real('old_cache_read_cost_per_m'),
    oldCacheWriteCostPerM: real('old_cache_write_cost_per_m'),

    // New pricing
    newInputCostPerM: real('new_input_cost_per_m').notNull(),
    newOutputCostPerM: real('new_output_cost_per_m').notNull(),
    newInputLongCostPerM: real('new_input_long_cost_per_m'),
    newOutputLongCostPerM: real('new_output_long_cost_per_m'),
    newCacheReadCostPerM: real('new_cache_read_cost_per_m'),
    newCacheWriteCostPerM: real('new_cache_write_cost_per_m'),

    // Metadata
    sourceUrl: text('source_url').notNull(),
    detectedAt: integer('detected_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    providerIdx: index('pricing_change_provider_idx').on(table.provider),
    modelIdIdx: index('pricing_change_model_id_idx').on(table.modelId),
    detectedAtIdx: index('pricing_change_detected_at_idx').on(table.detectedAt),
    changeTypeIdx: index('pricing_change_type_idx').on(table.changeType),
  })
);

export type PricingChangeLog = typeof pricingChangeLog.$inferSelect;
export type NewPricingChangeLog = typeof pricingChangeLog.$inferInsert;
