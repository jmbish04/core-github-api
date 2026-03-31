import { z } from 'zod';
import { BaseAutomation, type AutomationMetadata } from '@/automations/core/BaseAutomation';
import { appendSignature } from '@/utils/github/signature';
import { prependColbyPrimer } from '@/automations/shared/colby/primer';
import {
  detectPRAuthorAgent,
  formatAgentFixComment,
  isCodeReviewBot,
  type ExtractedReviewComment,
} from '@/utils/github/detectAgent';

const AgentTaggerPayloadSchema = z.object({
  action: z.string(),
  repository: z.object({
    name: z.string(),
    owner: z.object({
      login: z.string(),
    }),
  }),
  pull_request: z.object({
    number: z.number(),
    body: z.string().nullable().optional(),
    head: z.object({
      ref: z.string().optional(),
    }),
    user: z
      .object({
        login: z.string().optional(),
        html_url: z.string().optional(),
      })
      .optional(),
  }),
  review: z.object({
    user: z.object({
      login: z.string(),
    }),
  }),
});

type AgentTaggerPayload = z.infer<typeof AgentTaggerPayloadSchema>;

export class AgentTagger extends BaseAutomation<AgentTaggerPayload> {
  static readonly metadata: AutomationMetadata = {
    key: 'agent-tagger',
    domain: 'pr',
    description: 'Transforms automated review comments into agent-targeted fix requests.',
    events: ['pull_request_review'],
    alwaysOn: false,
    authPolicy: 'pat',
  };

  async shouldRun(): Promise<boolean> {
    if (this.eventName !== 'pull_request_review' || this.action !== 'submitted') {
      return false;
    }

    const parsed = AgentTaggerPayloadSchema.safeParse(this.payload);
    return parsed.success && isCodeReviewBot(parsed.data.review.user.login);
  }

  async run(): Promise<void> {
    const payload = AgentTaggerPayloadSchema.parse(this.payload);
    const prNumber = payload.pull_request.number;

    try {
      const octokit = await this.getGitHubClient();
      const issueComments = await octokit.rest.issues.listComments({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: prNumber,
        per_page: 100,
      });

      const agentInfo = detectPRAuthorAgent({
        headRef: payload.pull_request.head.ref,
        body: payload.pull_request.body || null,
        authorLogin: payload.pull_request.user?.login,
        authorHtmlUrl: payload.pull_request.user?.html_url,
        issueComments: issueComments.data.map((comment: { body?: string | null }) => ({
          body: comment.body || '',
        })),
      });

      if (!agentInfo) {
        await this.logExecution('skipped', 'Unable to detect target coding agent.', prNumber);
        return;
      }

      const reviewComments = await octokit.rest.pulls.listReviewComments({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        pull_number: prNumber,
        per_page: 100,
      });

      const botComments: ExtractedReviewComment[] = reviewComments.data
        .filter((comment: { user?: { login?: string } }) => comment.user?.login === payload.review.user.login)
        .map((comment: any) => ({
          path: comment.path || '',
          line: comment.line ?? comment.original_line ?? null,
          body: comment.body || '',
          diff_hunk: comment.diff_hunk || undefined,
          suggestion: comment.body?.match(/```suggestion\n([\s\S]*?)\n```/)?.[1] || undefined,
        }))
        .filter((comment) => Boolean(comment.path && comment.body));

      if (!botComments.length) {
        await this.logExecution('skipped', 'No automated review comments to transform.', prNumber);
        return;
      }

      const body = appendSignature(
        prependColbyPrimer(formatAgentFixComment(agentInfo.tag, prNumber, botComments)),
      );
      await octokit.rest.issues.createComment({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: prNumber,
        body,
      });

      await this.logExecution('success', 'Posted agent-tagged review summary via PAT identity.', prNumber);
    } catch (error) {
      await this.logExecution(
        'failure',
        `Agent tagger failed: ${error instanceof Error ? error.message : String(error)}`,
        prNumber,
      );
      throw error;
    }
  }
}
