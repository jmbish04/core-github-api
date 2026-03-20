import { z } from 'zod';
import { BaseAutomation, type AutomationMetadata } from '@/automations/core/BaseAutomation';
import { JulesSessionBuilder } from '@/services/jules/builder';
import { GitHubConditionals } from '@/utils/github/conditionals';

const JulesAutoFixPayloadSchema = z.object({
  action: z.string(),
  issue: z.object({
    number: z.number(),
  }),
  comment: z.object({
    body: z.string().optional(),
    user: z.object({
      login: z.string().optional(),
      type: z.string().optional(),
    }),
  }),
  repository: z.object({
    name: z.string(),
    owner: z.object({
      login: z.string(),
    }),
  }),
});

type JulesAutoFixPayload = z.infer<typeof JulesAutoFixPayloadSchema>;

export class JulesAutoFix extends BaseAutomation<JulesAutoFixPayload> {
  static readonly metadata: AutomationMetadata = {
    key: 'jules-auto-fix',
    domain: 'issues',
    description: 'Starts a Jules remediation session for automated review feedback.',
    events: ['issue_comment'],
    alwaysOn: false,
    authPolicy: 'pat',
  };

  async shouldRun(): Promise<boolean> {
    if (this.eventName !== 'issue_comment') {
      return false;
    }

    const parsed = JulesAutoFixPayloadSchema.safeParse(this.payload);
    if (!parsed.success || parsed.data.action !== 'created') {
      return false;
    }

    return GitHubConditionals.isBotOrAgentUser(parsed.data.comment.user);
  }

  async run(): Promise<void> {
    const payload = JulesAutoFixPayloadSchema.parse(this.payload);
    const feedback = payload.comment.body || '';
    const issueNumber = payload.issue.number;

    if (!feedback.includes('Review') && !feedback.includes('suggestion')) {
      await this.logExecution('skipped', 'No actionable review feedback found.', issueNumber);
      return;
    }

    try {
      await new JulesSessionBuilder(this.env)
        .withPrompt(`Gemini Code Assist provided a review on PR #${issueNumber}.\n\nFeedback:\n${feedback}\n\nPlease apply the fixes suggested in the feedback.`)
        .withRepo(payload.repository.owner.login, payload.repository.name)
        .withAutoPr()
        .start();

      await this.logExecution('success', 'Started Jules remediation session.', issueNumber);
    } catch (error) {
      await this.logExecution(
        'failure',
        `Jules auto-fix failed: ${error instanceof Error ? error.message : String(error)}`,
        issueNumber,
      );
      throw error;
    }
  }
}
