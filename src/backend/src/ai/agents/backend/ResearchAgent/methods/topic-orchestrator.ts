import { z } from 'zod';
import type { AIProvider } from '@/ai/providers';
import { getDb } from '@db';
import { researchBriefs, researchPlans } from '@db/schemas/github/research';
import { ResearchLogger } from '@research-logger';
import { Logger } from "@/lib/logger";

const PlanSchema = z.object({
  goals: z.array(z.string()).describe('List of high level research goals'),
  search_queries: z.array(z.string()).describe('Specific Google search queries to run'),
  required_sources: z.array(z.string()).describe('Specific websites or sources to target if any'),
});

type TopicOrchestratorDeps = {
  env: Env;
  ctx: ExecutionContext | DurableObjectState;
  ai: AIProvider;
};

export async function submitBrief(deps: TopicOrchestratorDeps, userId: string, title: string, content: any) {
  const db = getDb(deps.env.DB as any);
  const logger = new Logger(deps.env, "ResearchAgent:TopicOrchestrator");
  const logPreface = `[ResearchAgent - submitBrief] `;
  logger.info(`${logPreface}Submitting brief: ${title}`);
  const [brief] = await db.insert(researchBriefs).values({
    userId,
    title,
    rawBriefContent: JSON.stringify(content),
    status: 'planning',
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();
  logger.info(`${logPreface}Brief created: ${title}`);
  const researchLogger = new ResearchLogger(db, brief.id, null, 'ResearchAgent/TopicOrchestrator', deps.ctx);
  await researchLogger.logInfo('Lifecycle', `Brief created: ${title}`, { briefId: brief.id });
  logger.info(`${logPreface}Research logger created: ${brief.id}`);

  await formulatePlan(deps, brief.id, content, researchLogger);
  logger.info(`${logPreface}Plan formulated: ${brief.id}`);

  return brief;
}

async function formulatePlan(deps: TopicOrchestratorDeps, briefId: string, content: any, researchLogger: ResearchLogger) {
  await researchLogger.logThought('Planning', 'Analyzing user brief to generate research plan...');
  const logger = new Logger(deps.env, "ResearchAgent:TopicOrchestrator");
  const logPreface = `[ResearchAgent - formulatePlan] `;
  logger.info(`${logPreface}Formulating plan for brief: ${briefId}`);
  const db = getDb(deps.env.DB as any);
  logger.info(`${logPreface}Skill context built: ${briefId}`);

  let plan: unknown = {};
  try {
    plan = await deps.ai.generateStructuredResponse(
      JSON.stringify(content),
      PlanSchema,
      `You are an expert Research Planner.
Analyze the user request and create a list of specific research questions and Google search queries.`,
      { skills: ['deep-research', 'brainstorming', 'source-evaluation'] }
    );
  } catch (error) {
    await researchLogger.logError('Planning', error);
    logger.error(`${logPreface}Failed to generate structured plan: ${briefId}`);
    plan = { error: 'Failed to generate structured plan', details: String(error) };
  }

  await db.insert(researchPlans).values({
    briefId,
    currentVersion: JSON.stringify(plan),
    isApproved: false,
  });
  logger.info(`${logPreface}Plan saved: ${briefId}`);

  await researchLogger.logInfo('Planning', 'Plan generated and saved.', { plan });
  logger.info(`${logPreface}Research logger updated: ${briefId}`);
}
