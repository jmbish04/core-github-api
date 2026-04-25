/**
 * @file db/schemas/agents/function-configs.ts
 * @description Per-agent, per-function AI configuration overrides.
 *
 * Stores the primary/secondary provider+model, system instructions, and
 * prompt template for every named method of each canonical agent.
 *
 * At runtime, agents call `ai.getAgentFunctionConfig(agentName, functionName)`
 * to resolve their config from this table, falling back to hard-coded defaults.
 *
 * The centralized config can also be changed via the Frontend Config UI, which
 * optionally triggers a Jules coding session to "bake" the change into source code.
 */
import { sqliteTable, text, integer, index, unique } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const agentFunctionConfigs = sqliteTable(
  'agent_function_configs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    /** Canonical agent class name, e.g. "OrchestratorAgent" */
    agentName: text('agent_name').notNull(),

    /** Method name within the agent, e.g. "submitRequest" */
    functionName: text('function_name').notNull(),

    /** Human-readable label shown in the UI */
    label: text('label'),

    /** Primary AI provider: "gemini" | "openai" | "worker-ai" | "cloudflare" */
    primaryProvider: text('primary_provider').default('gemini'),

    /** Primary model identifier, e.g. "gemini-2.5-pro-exp" */
    primaryModel: text('primary_model').default('gemini-2.0-flash'),

    /** Fallback provider if the primary fails */
    secondaryProvider: text('secondary_provider').default('worker-ai'),

    /** Fallback model identifier */
    secondaryModel: text('secondary_model').default('@cf/meta/llama-3.3-70b-instruct-fp8-fast'),

    /** System instructions override. NULL = use hardcoded default in the agent. */
    systemInstructions: text('system_instructions'),

    /**
     * Optional prompt template with {{variable}} substitutions.
     * NULL = agent assembles the prompt itself.
     */
    promptTemplate: text('prompt_template'),

    /** Operator notes for auditing or documentation purposes. */
    notes: text('notes'),

    /** Whether this config override is active (false = use agent defaults). */
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),

    updatedAt: integer('updated_at', { mode: 'timestamp' }).$onUpdate(() => new Date()),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    /** Each agent+function pair has exactly one config row. */
    agentFunctionUniq: unique('agent_function_configs_uniq').on(t.agentName, t.functionName),

    agentIdx: index('agent_function_configs_agent_idx').on(t.agentName),
    activeIdx: index('agent_function_configs_active_idx').on(t.isActive),
  }),
);

export type AgentFunctionConfig = typeof agentFunctionConfigs.$inferSelect;
export type NewAgentFunctionConfig = typeof agentFunctionConfigs.$inferInsert;
