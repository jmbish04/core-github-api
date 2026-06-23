import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import { agentSkills } from './skills';

/**
 * Agent Skill Allowed Tools — relational mapping of which MCP/tool names
 * each skill is permitted to invoke. Populated during out-of-band ingestion
 * from the `allowed-tools` YAML key in SKILL.md files.
 *
 * @governance Owned by DB (core). Cascades on skill deletion.
 */
export const agentSkillAllowedTools = sqliteTable('agent_skill_allowed_tools', {
  id: text('id').primaryKey(),
  skillId: text('skill_id').notNull().references(() => agentSkills.id, { onDelete: 'cascade' }),
  toolName: text('tool_name').notNull(),
}, (table) => ({
  skillIdx: index('skill_allowed_tools_skill_idx').on(table.skillId),
  toolIdx: index('skill_allowed_tools_tool_idx').on(table.toolName),
}));
