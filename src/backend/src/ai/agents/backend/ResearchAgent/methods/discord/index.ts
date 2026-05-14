import {
  collectDiscordResearchCorpus,
  DiscordResearchPayloadSchema,
  type DiscordResearchPayload,
  type DiscordResearchCorpus
} from './shared';
import { Logger } from "@/lib/logger";


export * from './shared';

/**
 * Perform a targeted search against Discord messages in authorized guilds and channels.
 * Limited to 25 matches by default.
 */
export async function searchDiscordMessages(env: Env, input: DiscordResearchPayload): Promise<DiscordResearchCorpus> {
  const corpus = await collectDiscordResearchCorpus(env, input);
  return {
    query: corpus.query,
    scannedGuilds: corpus.scannedGuilds,
    scannedChannels: corpus.scannedChannels,
    scannedMessages: corpus.scannedMessages,
    matches: corpus.matches.slice(0, 25),
  };
}

/**
 * Triggers the overarching Discord research workflow.
 */
export async function triggerDiscordResearchWorkflow(env: Env, input: DiscordResearchPayload): Promise<{ workflowInstanceId: string }> {
  const logger = new Logger(env, "ResearchAgent:discord");
  const workflowBinding = (env as any).DISCORD_RESEARCH_WORKFLOW;
  if (!workflowBinding || typeof workflowBinding.create !== 'function') {
    logger.error('[triggerDiscordResearchWorkflow] DISCORD_RESEARCH_WORKFLOW binding is not configured');
    throw new Error('DISCORD_RESEARCH_WORKFLOW binding is not configured');
  }
  const instance = await workflowBinding.create({ params: DiscordResearchPayloadSchema.parse(input) });
  logger.info(`[triggerDiscordResearchWorkflow] Workflow instance created: ${instance.id}`);
  return { workflowInstanceId: instance.id };
}
