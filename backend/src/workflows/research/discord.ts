import { workflow, step } from '@/ai/agents/honi';
import { WorkflowEntrypoint } from 'cloudflare:workers';
import { resolveDefaultAiModel, resolveDefaultAiProvider } from '@/ai/providers/config';
import { runStructuredResponseWithModelFallback } from '@/ai/utils/gateway-client';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';
import {
  collectDiscordResearchCorpus,
  DiscordResearchPayloadSchema,
  type DiscordResearchPayload,
  type DiscordResearchCorpus,
} from '@/ai/agents/research/discord-shared';

const DiscordResearchAnalysisSchema = z.object({
  themes: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  opportunities: z.array(z.string()).default([]),
  summary: z.string(),
});

export type DiscordResearchAnalysis = z.infer<typeof DiscordResearchAnalysisSchema>;

let activeEnv: Env | null = null;

const BaseDiscordResearchWorkflow = workflow<Env, DiscordResearchPayload>({
  steps: [
    step<DiscordResearchPayload, DiscordResearchCorpus>(
      {
        name: 'collect-discord-corpus',
        retries: { limit: 3, backoff: 'exponential' },
      },
      async (input, workflowStep) => {
        const env = activeEnv;
        if (!env) {
          throw new Error('DiscordResearchWorkflow env is not initialized');
        }
        const payload = DiscordResearchPayloadSchema.parse(input);
        return workflowStep.do('fetch-discord-messages', async () => collectDiscordResearchCorpus(env, payload));
      },
    ),
    step<DiscordResearchCorpus, DiscordResearchAnalysis>(
      {
        name: 'analyze-discord-corpus',
        timeout: '60 seconds',
      },
      async (corpus, workflowStep) => {
        const env = activeEnv;
        if (!env) {
          throw new Error('DiscordResearchWorkflow env is not initialized');
        }

        return workflowStep.do('analyze-discord-results', async () => {
          const provider = resolveDefaultAiProvider(env);
          const model = resolveDefaultAiModel(env, provider);
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

          const result = await runStructuredResponseWithModelFallback(
            env,
            provider,
            model,
            [
              'You are a Discord research analyst.',
              'Analyze the matching messages for themes, risks, and opportunities.',
              'Return only JSON matching this schema:',
              JSON.stringify(zodToJsonSchema(DiscordResearchAnalysisSchema as any, 'discord_research_analysis'), null, 2),
            ].join('\n\n'),
            [
              `Query: ${corpus.query}`,
              `Scanned guilds: ${corpus.scannedGuilds}`,
              `Scanned channels: ${corpus.scannedChannels}`,
              `Scanned messages: ${corpus.scannedMessages}`,
              `Matched messages: ${corpus.matches.length}`,
              'Corpus:',
              matches || 'No matches found.',
            ].join('\n\n'),
          );

          return DiscordResearchAnalysisSchema.parse(result);
        });
      },
    ),
    step<DiscordResearchAnalysis, { themes: string[]; risks: string[]; opportunities: string[]; summary: string; completedAt: string }>(
      {
        name: 'summarize-discord-research',
      },
      async (analysis, workflowStep) => {
        return workflowStep.do('create-discord-summary', async () => ({
          themes: analysis.themes,
          risks: analysis.risks,
          opportunities: analysis.opportunities,
          summary: analysis.summary,
          completedAt: new Date().toISOString(),
        }));
      },
    ),
  ],
  onComplete: async (result) => {
    console.log('Discord research complete:', result.summary);
  },
  onError: async (error) => {
    console.error('Discord research failed:', error.message);
  },
});

export class DiscordResearchWorkflow extends WorkflowEntrypoint<Env, DiscordResearchPayload> {
  async run(event: any, workflowStep: any): Promise<unknown> {
    activeEnv = this.env;
    try {
      const BaseClass = BaseDiscordResearchWorkflow as any;
      const instance = new BaseClass();
      instance.env = this.env;
      instance.ctx = this.ctx;
      return await instance.run(event, workflowStep);
    } finally {
      activeEnv = null;
    }
  }
}
