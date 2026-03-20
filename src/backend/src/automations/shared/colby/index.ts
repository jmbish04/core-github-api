import { z } from 'zod';
import { BaseAutomation, type AutomationMetadata } from '@/automations/core/BaseAutomation';
import { parseColbyRequest } from './parser';
import { handleColbyInvocationAndReply } from './router';

const ColbyAutomationPayloadSchema = z
  .object({
    repository: z.object({
      name: z.string(),
      default_branch: z.string().optional(),
      owner: z.object({
        login: z.string(),
      }),
    }),
  })
  .passthrough();

type ColbyAutomationPayload = z.infer<typeof ColbyAutomationPayloadSchema>;

function isSupportedAction(eventName: string, action: string | null): boolean {
  if (eventName === 'issues') {
    return action === 'opened' || action === 'edited';
  }

  if (eventName === 'issue_comment' || eventName === 'pull_request_review_comment') {
    return action === 'created' || action === 'edited';
  }

  if (eventName === 'pull_request_review') {
    return action === 'submitted' || action === 'edited';
  }

  return false;
}

export class SlashCommand extends BaseAutomation<ColbyAutomationPayload> {
  static readonly metadata: AutomationMetadata = {
    key: 'slash-command',
    domain: 'issues',
    description: 'Routes /colby and @colby commands across issues and pull request discussions.',
    events: ['issues', 'issue_comment', 'pull_request_review_comment', 'pull_request_review'],
    alwaysOn: false,
    authPolicy: 'pat',
  };

  async shouldRun(): Promise<boolean> {
    if (!SlashCommand.metadata.events.includes(this.eventName)) {
      return false;
    }

    if (!isSupportedAction(this.eventName, this.action)) {
      return false;
    }

    if (!ColbyAutomationPayloadSchema.safeParse(this.payload).success) {
      return false;
    }

    return parseColbyRequest(this.eventName, this.action, this.payload) !== null;
  }

  async run(): Promise<void> {
    const payload = ColbyAutomationPayloadSchema.parse(this.payload);
    const parsed = parseColbyRequest(this.eventName, this.action, payload);

    if (!parsed) {
      await this.logExecution('skipped', 'No valid Colby invocation was found in the payload.');
      return;
    }

    try {
      const octokit = await this.getGitHubClient();
      const requestContext = this.octokitRequestContext;

      await handleColbyInvocationAndReply(parsed.invocation, {
        ...parsed.context,
        env: this.env,
        executionCtx: requestContext.executionCtx as unknown as ExecutionContext,
        octokit,
      });

      await this.logExecution(
        'success',
        `Processed Colby command: ${parsed.invocation.command}`,
        parsed.context.thread.number,
      );
    } catch (error) {
      await this.logExecution(
        'failure',
        `Slash command failed: ${error instanceof Error ? error.message : String(error)}`,
        parsed.context.thread.number,
      );
      throw error;
    }
  }
}
