import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';

import { AIProvider } from '@/ai/providers';
import { z } from 'zod';
import {
  collectDiscordResearchCorpus,
  DiscordResearchPayloadSchema,
  type DiscordResearchPayload,
  type DiscordResearchCorpus,
} from '@/ai/agents/backend/ResearchAgent/methods/discord/shared';

const DiscordResearchAnalysisSchema = z.object({
  themes: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  opportunities: z.array(z.string()).default([]),
  summary: z.string(),
});

export type DiscordResearchAnalysis = z.infer<typeof DiscordResearchAnalysisSchema>;

export class DiscordResearchWorkflow extends WorkflowEntrypoint<Env, DiscordResearchPayload> {
  async run(event: WorkflowEvent<DiscordResearchPayload>, step: WorkflowStep): Promise<unknown> {
    const env = this.env;

    const corpus = await step.do(
      'collect-discord-corpus',
      { retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' } },
      async () => {
        const payload = DiscordResearchPayloadSchema.parse(event.payload);
        return collectDiscordResearchCorpus(env, payload);
      }
    );

    const analysis = await step.do(
      'analyze-discord-corpus',
      { timeout: '60 seconds' },
      async () => {
        const matches = corpus.matches
          .slice(0, 40)
          .map((match, index) => {
            return [
              `Match ${index + 1}`,
              `Guild: ${match.guildName || match.guildId || 'unknown'}`,
              `Channel: ${match.channelName || match.channelId}`,
              `Author: ${match.author || 'unknown'}`,
              `Timestamp: ${match.timestamp}`,
              `Content: ${match.content}`,
            ].join('\n');
          })
          .join('\n\n');

        const ai = new AIProvider(env);
        const result = await ai.generateStructuredResponse<DiscordResearchAnalysis>(
          [
            'DISCUSSION CONTEXT:',
            `Query: ${corpus.query}`,
            `Scanned guilds: ${corpus.scannedGuilds}`,
            `Scanned channels: ${corpus.scannedChannels}`,
            `Scanned messages: ${corpus.scannedMessages}`,
            `Matched messages: ${corpus.matches.length}`,
            'Corpus:',
            matches || 'No matches found.',
          ].join('\n\n'),
          DiscordResearchAnalysisSchema,
          [
            'You are a Discord research analyst.',
            'Analyze the matching messages for themes, risks, and opportunities.',
            'Return only JSON matching this schema.',
          ].join('\n\n'),
        );

        return result;
      }
    );

    const summaryResults = await step.do(
      'summarize-discord-research',
      async () => ({
        themes: analysis.themes,
        risks: analysis.risks,
        opportunities: analysis.opportunities,
        summary: analysis.summary,
        completedAt: new Date().toISOString(),
      })
    );

    console.log('Discord research complete:', summaryResults.summary);
    return summaryResults;
  }
}
