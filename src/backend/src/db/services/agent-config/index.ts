/**
 * @file db/services/agent-config/index.ts
 * @description CRUD service for the agent_function_configs table.
 *
 * Provides the runtime config lookup used by every canonical agent via
 * `new AIProvider(env).getAgentFunctionConfig(agentName, functionName)`.
 *
 * @module Services/AgentConfig
 */
import { getDb } from '@db';
import { agentFunctionConfigs } from '@db/schemas/agents';
import { eq, and } from 'drizzle-orm';
import type { AgentFunctionConfig, NewAgentFunctionConfig } from '@db/schemas/agents';
import { Logger } from '@/lib/logger';

export type { AgentFunctionConfig, NewAgentFunctionConfig };

export class AgentConfigService {
  private db;
  private logger: Logger;

  constructor(private env: Env) {
    this.db = getDb(env.DB);
    this.logger = new Logger(env, 'AgentConfigService');
  }

  /**
   * Fetch the active config for a specific agent method.
   * Returns null if no config row exists or if the row is inactive.
   */
  async getConfig(
    agentName: string,
    functionName: string,
  ): Promise<AgentFunctionConfig | null> {
    try {
      const rows = await this.db
        .select()
        .from(agentFunctionConfigs)
        .where(
          and(
            eq(agentFunctionConfigs.agentName, agentName),
            eq(agentFunctionConfigs.functionName, functionName),
            eq(agentFunctionConfigs.isActive, true),
          ),
        )
        .limit(1);

      return rows[0] ?? null;
    } catch (err: any) {
      this.logger.warn(`getConfig failed for ${agentName}.${functionName}`, { error: err.message });
      return null;
    }
  }

  /**
   * List all configs, optionally filtered to a specific agent.
   */
  async listConfigs(agentName?: string): Promise<AgentFunctionConfig[]> {
    try {
      const query = this.db.select().from(agentFunctionConfigs);

      if (agentName) {
        return query.where(eq(agentFunctionConfigs.agentName, agentName));
      }
      return query;
    } catch (err: any) {
      this.logger.error('listConfigs failed', { error: err.message });
      return [];
    }
  }

  /**
   * Insert or update a config row (upsert by agentName + functionName).
   */
  async upsertConfig(
    config: Partial<NewAgentFunctionConfig> &
      Pick<NewAgentFunctionConfig, 'agentName' | 'functionName'>,
  ): Promise<AgentFunctionConfig> {
    const now = new Date();

    await this.db
      .insert(agentFunctionConfigs)
      .values({
        ...config,
        updatedAt: now,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [agentFunctionConfigs.agentName, agentFunctionConfigs.functionName],
        set: {
          ...config,
          updatedAt: now,
        },
      });

    const updated = await this.getConfig(config.agentName, config.functionName);
    if (!updated) throw new Error(`Upsert succeeded but row not found for ${config.agentName}.${config.functionName}`);
    return updated;
  }

  /**
   * Soft-delete: mark the config as inactive.
   */
  async deactivateConfig(id: number): Promise<void> {
    await this.db
      .update(agentFunctionConfigs)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(agentFunctionConfigs.id, id));
  }

  /**
   * Hard-delete a config row by ID.
   */
  async deleteConfig(id: number): Promise<void> {
    await this.db
      .delete(agentFunctionConfigs)
      .where(eq(agentFunctionConfigs.id, id));
  }
}
