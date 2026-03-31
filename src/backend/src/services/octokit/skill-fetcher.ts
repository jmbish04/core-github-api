/**
 * @file skill-fetcher.ts
 * @description Canonical export for the dynamic "Agent Skills" remote loader.
 *
 * Agents fetch their SKILL.md files at runtime from the repository defined
 * in `env.GITHUB_REPO_STANDARDIZATION` (format: "owner/repo").
 *
 * Usage in an agent system-prompt builder:
 * ```ts
 * import { fetchRemoteSkill } from '@services/octokit/skill-fetcher';
 *
 * const [planSkill, archSkill] = await Promise.all([
 *   fetchRemoteSkill(env, 'skills/plan-writing/SKILL.md'),
 *   fetchRemoteSkill(env, 'skills/architecture/SKILL.md'),
 * ]);
 * const skillContext = [planSkill, archSkill].filter(Boolean).join('\n\n');
 * // Append to system: `\n\n<skill_context>\n${skillContext}\n</skill_context>`
 * ```
 */
export { fetchDynamicSkill as fetchRemoteSkill } from './utils/repos';
export type { SkillFetcherEnv } from './utils/repos';

/**
 * Skill path registry — maps agent names to their remote skill file paths.
 * Adjust skill paths to match the layout in GITHUB_REPO_STANDARDIZATION.
 */
export const AGENT_SKILL_PATHS: Record<string, string[]> = {
  // ── Workshop / Builder agents ───────────────────────────────────────────────
  WorkshopAgent: [
    'skills/plan-writing/SKILL.md',
    'skills/architecture/SKILL.md',
    'skills/workers-best-practices/SKILL.md',
  ],
  CfWorkshop_AgentsSdk: [
    'skills/agents-sdk/SKILL.md',
    'skills/workers-best-practices/SKILL.md',
    'skills/mcp-builder/SKILL.md',
    'skills/durable-objects/SKILL.md',
  ],
  UIFrameworkAgent: [
    'skills/copywriting/SKILL.md',
    'skills/frontend-design/SKILL.md',
    'skills/react-best-practices/SKILL.md',
  ],
  StitchDesignAgent: [
    'skills/frontend-design/SKILL.md',
    'skills/react-best-practices/SKILL.md',
    'skills/ui-ux-pro-max/SKILL.md',
  ],

  // ── Orchestration agents ────────────────────────────────────────────────────
  OrchestratorAgent: [
    'skills/plan-writing/SKILL.md',
    'skills/architecture/SKILL.md',
  ],
  PlannerAgent: [
    'skills/plan-writing/SKILL.md',
    'skills/brainstorming/SKILL.md',
  ],
  TopicOrchestratorAgent: [
    'skills/plan-writing/SKILL.md',
    'skills/brainstorming/SKILL.md',
  ],

  // ── Research agents ─────────────────────────────────────────────────────────
  ResearchAgent: [
    'skills/evidence-discipline/SKILL.md',
    'skills/systematic-debugging/SKILL.md',
    'skills/api-patterns/SKILL.md',
  ],
  DeepResearchChatAgent: [
    'skills/evidence-discipline/SKILL.md',
    'skills/brainstorming/SKILL.md',
  ],
  WebSearchAgent: [
    'skills/evidence-discipline/SKILL.md',
  ],

  // ── Evaluation / Quality agents ─────────────────────────────────────────────
  JudgeAgent: [
    'skills/evidence-discipline/SKILL.md',
    'skills/code-review-checklist/SKILL.md',
  ],
  StandardizationAgent: [
    'skills/code-review-checklist/SKILL.md',
    'skills/evidence-discipline/SKILL.md',
    'skills/workers-best-practices/SKILL.md',
    'skills/api-patterns/SKILL.md',
  ],
  ReportingAgent: [
    'skills/documentation-templates/SKILL.md',
    'skills/evidence-discipline/SKILL.md',
  ],

  // ── Infrastructure / Ops agents ─────────────────────────────────────────────
  HealthDiagnostician: [
    'skills/systematic-debugging/SKILL.md',
    'skills/evidence-discipline/SKILL.md',
    'skills/workers-best-practices/SKILL.md',
  ],
  Supervisor: [
    'skills/systematic-debugging/SKILL.md',
    'skills/server-management/SKILL.md',
  ],

  // ── AI / Reasoning agents ───────────────────────────────────────────────────
  GeminiAgent: [
    'skills/evidence-discipline/SKILL.md',
  ],
  DeepReasoningAgent: [
    'skills/evidence-discipline/SKILL.md',
    'skills/systematic-debugging/SKILL.md',
  ],

  // ── Documentation agents ────────────────────────────────────────────────────
  CloudflareDocsAgent: [
    'skills/workers-best-practices/SKILL.md',
    'skills/cloudflare/SKILL.md',
    'skills/agents-sdk/SKILL.md',
  ],

  // ── Jules / CI agents ───────────────────────────────────────────────────────
  JulesOverseer: [
    'skills/plan-writing/SKILL.md',
    'skills/evidence-discipline/SKILL.md',
  ],
};

/**
 * Fetches all skills for a given agent and returns them as a formatted
 * `<skill_context>` block ready to be appended to a system prompt.
 *
 * @param env       - Worker Env bindings
 * @param agentName - Key from AGENT_SKILL_PATHS
 * @returns         - Formatted `<skill_context>...</skill_context>` string, or ''
 */
export async function buildSkillContext(
  env: { GITHUB_TOKEN: any; GITHUB_REPO_STANDARDIZATION: string | undefined },
  agentName: string,
): Promise<string> {
  const { fetchRemoteSkill: fetch } = await import('./utils/repos').then(m => ({
    fetchRemoteSkill: m.fetchDynamicSkill,
  }));

  const paths = AGENT_SKILL_PATHS[agentName] ?? [];
  if (paths.length === 0) return '';

  const skills = await Promise.all(paths.map((p) => fetch(env as any, p)));
  const content = skills.filter(Boolean).join('\n\n---\n\n');
  if (!content) return '';

  return `\n\n<skill_context>\n${content}\n</skill_context>`;
}
