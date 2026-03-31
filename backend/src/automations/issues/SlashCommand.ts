import { z } from 'zod';
import { BaseAutomation, type AutomationMetadata } from '@/core/BaseAutomation';
import { SlashCommandRouter } from '@/automations/push/router';

const SlashCommandPayloadSchema = z.object({
  action: z.string(),
  issue: z
    .object({
      number: z.number(),
      body: z.string().nullable().optional(),
    })
    .optional(),
  comment: z
    .object({
      body: z.string().optional(),
    })
    .optional(),
  repository: z.object({
    name: z.string(),
    default_branch: z.string(),
    owner: z.object({
      login: z.string(),
    }),
  }),
});

type SlashCommandPayload = z.infer<typeof SlashCommandPayloadSchema>;

export class SlashCommand extends BaseAutomation<SlashCommandPayload> {
  static readonly metadata: AutomationMetadata = {
    key: 'slash-command',
    domain: 'issues',
    description: 'Routes /colby slash commands from issues and issue comments.',
    events: ['issues', 'issue_comment'],
    alwaysOn: false,
    authPolicy: 'pat',
  };

  async shouldRun(): Promise<boolean> {
    if (this.eventName !== 'issues' && this.eventName !== 'issue_comment') {
      return false;
    }

    const parsed = SlashCommandPayloadSchema.safeParse(this.payload);
    if (!parsed.success) {
      return false;
    }

    const body = parsed.data.comment?.body || parsed.data.issue?.body || '';
    if (!body.includes('/colby')) {
      return false;
    }

    if (this.eventName === 'issues') {
      return this.action === 'opened' || this.action === 'edited';
    }

    return this.action === 'created';
  }

  async run(): Promise<void> {
    const payload = SlashCommandPayloadSchema.parse(this.payload);
    const body = payload.comment?.body || payload.issue?.body || '';
    const issueNumber = payload.issue?.number;

    if (!issueNumber) {
      await this.logExecution('skipped', 'Slash command payload missing issue number.');
      return;
    }

    try {
      const octokit = await this.getGitHubClient();
      const requestContext = this.octokitRequestContext;
      await SlashCommandRouter.handleAndReply(
        body,
        {
          env: this.env,
          executionCtx: requestContext.executionCtx as any,
          repo: {
            owner: payload.repository.owner.login,
            name: payload.repository.name,
            defaultBranch: payload.repository.default_branch,
          },
          octokit,
        },
        {
          issueNumber,
          issueBody: payload.issue?.body || undefined,
        },
      );

      await this.logExecution('success', 'Processed /colby command via PAT identity.', issueNumber);
    } catch (error) {
      await this.logExecution(
        'failure',
        `Slash command failed: ${error instanceof Error ? error.message : String(error)}`,
        issueNumber,
      );
      throw error;
    }
  }
}
