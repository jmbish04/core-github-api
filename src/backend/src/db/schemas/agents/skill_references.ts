import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import { agentSkills } from './skills';

/**
 * Agent Skill References — cross-references between skills for
 * dependency tracking, related skill discovery, and supersession chains.
 *
 * Populated during out-of-band ingestion when SKILL.md files declare
 * references to other skills (e.g., "For signup flows, see signup-flow-cro").
 *
 * @governance Owned by DB (core). Cascades on skill deletion.
 */
export const agentSkillReferences = sqliteTable('agent_skill_references', {
  id: text('id').primaryKey(),
  skillId: text('skill_id').notNull().references(() => agentSkills.id, { onDelete: 'cascade' }),
  referenceType: text('reference_type').notNull(), // 'depends_on' | 'related_to' | 'supersedes'
  referenceName: text('reference_name').notNull(), // target skill name (not FK — may reference uningested skills)
}, (table) => ({
  skillIdx: index('skill_references_skill_idx').on(table.skillId),
  refNameIdx: index('skill_references_ref_name_idx').on(table.referenceName),
}));
