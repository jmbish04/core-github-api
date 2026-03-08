import { z } from 'zod';
import { BaseAutomation, type AutomationMetadata } from '@/core/BaseAutomation';
import {
  processCodeReviewComment,
  processPullRequestEvent,
  processStandardPrComment,
} from '@/services/github/pr-ingestion';

const PullRequestEventPayloadSchema = z.object({
  repository: z.object({
    name: z.string(),
    owner: z.object({
      login: z.string(),
    }),
  }),
  pull_request: z.object({
    number: z.number(),
  }),
});

const PullRequestReviewCommentPayloadSchema = z.object({
  repository: z.object({
    name: z.string(),
    owner: z.object({
      login: z.string(),
    }),
  }),
  pull_request: z.object({
    number: z.number(),
  }),
  comment: z.object({
    id: z.number(),
  }),
});

const IssueCommentPullRequestPayloadSchema = z.object({
  repository: z.object({
    name: z.string(),
    owner: z.object({
      login: z.string(),
    }),
  }),
  issue: z.object({
    number: z.number(),
    pull_request: z.object({}).optional(),
  }),
  comment: z.object({
    id: z.number(),
  }),
});

type PRIngestPayload =
  | z.infer<typeof PullRequestEventPayloadSchema>
  | z.infer<typeof PullRequestReviewCommentPayloadSchema>
  | z.infer<typeof IssueCommentPullRequestPayloadSchema>;

export class PRIngest extends BaseAutomation<PRIngestPayload> {
  static readonly metadata: AutomationMetadata = {
    key: 'pr-ingest',
    domain: 'pr',
    description: 'Persists pull request state and PR-linked comment activity into the internal database.',
    events: ['pull_request', 'pull_request_review_comment', 'issue_comment'],
    alwaysOn: true,
    authPolicy: 'app',
  };

  async shouldRun(): Promise<boolean> {
    if (this.eventName === 'pull_request') {
      return PullRequestEventPayloadSchema.safeParse(this.payload).success;
    }

    if (this.eventName === 'pull_request_review_comment') {
      return PullRequestReviewCommentPayloadSchema.safeParse(this.payload).success;
    }

    if (this.eventName === 'issue_comment') {
      const parsed = IssueCommentPullRequestPayloadSchema.safeParse(this.payload);
      return parsed.success && Boolean(parsed.data.issue.pull_request);
    }

    return false;
  }

  async run(): Promise<void> {
    try {
      if (this.eventName === 'pull_request') {
        const payload = PullRequestEventPayloadSchema.parse(this.payload);
        await processPullRequestEvent(this.env, payload);
        await this.logExecution('success', 'Ingested pull request payload.', payload.pull_request.number);
        return;
      }

      if (this.eventName === 'pull_request_review_comment') {
        const payload = PullRequestReviewCommentPayloadSchema.parse(this.payload);
        await processCodeReviewComment(this.env, payload);
        await this.logExecution(
          'success',
          'Ingested pull request review comment payload.',
          payload.pull_request.number,
        );
        return;
      }

      const payload = IssueCommentPullRequestPayloadSchema.parse(this.payload);
      await processStandardPrComment(this.env, payload);
      await this.logExecution(
        'success',
        'Ingested pull request issue comment payload.',
        payload.issue.number,
      );
    } catch (error) {
      await this.logExecution(
        'failure',
        `PR ingest failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
