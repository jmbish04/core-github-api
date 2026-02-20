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
