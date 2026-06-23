import { z } from 'zod';
import { getDb } from '@db';
import { researchBriefs, researchPlans } from '@/db/schemas/github/research';
import { ResearchLogger } from '@research-logger';

import type { OrchestratorAgent } from '../index';

const PlanSchema = z.object({
  goals: z.array(z.string()).describe('List of high level research goals'),
  search_queries: z.array(z.string()).describe('Specific Google search queries to run'),
  required_sources: z.array(z.string()).describe('Specific websites or sources to target if any'),
});

export async function submitBrief(agent: OrchestratorAgent, userId: string, title: string, content: any) {
  const db = getDb((agent as any).env.DB as any);

  const [brief] = await db.insert(researchBriefs).values({
    userId,
    title,
    rawBriefContent: JSON.stringify(content),
    status: 'planning',
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  const researchLogger = new ResearchLogger(db, brief.id, null, 'OrchestratorAgent', (agent as any).ctx);
  await researchLogger.logInfo('Lifecycle', `Brief created: ${title}`, { briefId: brief.id });

  (agent as any).ctx.waitUntil(formulatePlan(agent, brief.id, content, researchLogger));

  return brief;
}

async function formulatePlan(agent: OrchestratorAgent, briefId: string, content: any, researchLogger: ResearchLogger) {
  await researchLogger.logThought('Planning', 'Analyzing user brief to generate research plan...');

  const db = getDb((agent as any).env.DB as any);

  let plan: unknown = {};
  try {
    plan = await (agent as any).ai.generateStructuredResponse(
      JSON.stringify(content),
      PlanSchema,
      `You are an expert Research Planner.
Analyze the user request and create a list of specific research questions and Google search queries.`,
      { skills: ['deep-research', 'brainstorming'] },
    );
  } catch (error) {
    await researchLogger.logError('Planning', error);
    plan = { error: 'Failed to generate structured plan', details: String(error) };
  }

  await db.insert(researchPlans).values({
    briefId,
    currentVersion: JSON.stringify(plan),
    isApproved: false,
  });

  await researchLogger.logInfo('Planning', 'Plan generated and saved.', { plan });
}
