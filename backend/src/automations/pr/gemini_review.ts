import { z } from 'zod';
import { BaseAutomation, type AutomationMetadata } from '@/core/BaseAutomation';
import { appendSignature } from '@/utils/github/signature';
import { GitHubConditionals } from '@/utils/github/conditionals';

const PullRequestPayloadSchema = z.object({
  action: z.string(),
  repository: z.object({
    name: z.string(),
    owner: z.object({
      login: z.string(),
    }),
  }),
  pull_request: z.object({
    number: z.number(),
    draft: z.boolean().optional(),
  }),
});

type PullRequestPayload = z.infer<typeof PullRequestPayloadSchema>;

export class GeminiReview extends BaseAutomation<PullRequestPayload> {
  static readonly metadata: AutomationMetadata = {
    key: 'gemini-review',
    domain: 'pr',
    description: 'Requests an automated Gemini review on newly updated pull requests.',
    events: ['pull_request'],
    alwaysOn: false,
    authPolicy: 'pat',
  };

  async shouldRun(): Promise<boolean> {
    if (this.eventName !== 'pull_request') {
      return false;
    }

    if (this.action !== 'synchronize' && this.action !== 'ready_for_review') {
      return false;
    }

    return PullRequestPayloadSchema.safeParse(this.payload).success;
  }

  async run(): Promise<void> {
    const payload = PullRequestPayloadSchema.parse(this.payload);
    const { owner, name: repo } = payload.repository;
    const prNumber = payload.pull_request.number;

    if (payload.pull_request.draft && this.action !== 'ready_for_review') {
      await this.logExecution('skipped', 'Pull request is still draft.', prNumber);
      return;
    }

    try {
      const octokit = await this.getGitHubClient();
      const existingComments = await octokit.rest.issues.listComments({
        owner: owner.login,
        repo,
        issue_number: prNumber,
        per_page: 50,
      });

      const alreadyRequested = GitHubConditionals.hasCommentCommand(
        existingComments.data,
        '/gemini review',
      );

      if (alreadyRequested) {
        await this.logExecution('skipped', 'Gemini review already requested.', prNumber);
        return;
      }

      await octokit.rest.issues.createComment({
        owner: owner.login,
        repo,
        issue_number: prNumber,
        body: appendSignature('/gemini review'),
      });

      await this.logExecution('success', 'Posted /gemini review using PAT identity.', prNumber);
    } catch (error) {
      await this.logExecution(
        'failure',
        `Failed to request Gemini review: ${error instanceof Error ? error.message : String(error)}`,
        prNumber,
      );
      throw error;
    }
  }
}
