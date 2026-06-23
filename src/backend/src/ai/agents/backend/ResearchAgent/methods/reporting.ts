import type { AIProvider } from '@/ai/providers';
import { ResearchLogger } from '@research-logger';
import { getDb } from '@db';
import { Logger } from "@/lib/logger";

type ReportingDeps = {
  env: Env;
  ctx: ExecutionContext | DurableObjectState;
  ai: AIProvider;
};

export async function generateReport(deps: ReportingDeps, briefId: string, candidates: any[], plan: any) {
  const logger = new Logger(deps.env, "ResearchAgent:Reporting");
  const logPreface = `[ResearchAgent - generateReport] `;
  logger.info(`${logPreface}Generating report for brief: ${briefId}`);
  const db = getDb(deps.env.DB as any);
  const researchLogger = new ResearchLogger(db, briefId, null, 'ResearchAgent/Reporting', deps.ctx);
  logger.info(`${logPreface}Research logger created: ${briefId}`);

  await researchLogger.logInfo('Reporting', `Synthesizing report from ${candidates.length} sources...`);
  logger.info(`${logPreface}Research logger updated: ${briefId}`);

  const sourcesText = candidates
    .map((candidate, index) => `Source [${index + 1}] (${candidate.sourceUrl}): ${candidate.initialSummary}`)
    .join('\n\n');
  const prompt = `Research Goal: ${JSON.stringify(plan)}\n\nVerified Sources:\n${sourcesText}\n\nGenerate a comprehensive markdown report. Cite sources using [Source URL] notation.`;

  const report = await deps.ai.generateText(
    prompt,
    `You remain objective and thorough. Synthesize the provided sources into a cohesive report.
Use standard Markdown. Include a "Key Findings", "Detailed Analysis", and "References" section.`,
    { skills: ['deep-research', 'brainstorming', 'source-evaluation'] }
  );

  await researchLogger.logToolOutput('ReportGeneration', 'Report generated successfully.');
  logger.info(`${logPreface}Research logger updated: ${briefId}`);
  return report;
}
