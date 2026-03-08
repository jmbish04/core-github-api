import { z } from 'zod';
import { BaseAutomation, type AutomationMetadata } from '@/core/BaseAutomation';
import { extractReviewCommentsAndPostReply } from '@/services/github/pr-ingestion';

const PRReviewExtractionPayloadSchema = z.object({
  action: z.string(),
  repository: z.object({
    name: z.string(),
    owner: z.object({
      login: z.string(),
    }),
  }),
  pull_request: z.object({
    number: z.number(),
  }),
  review: z.object({
    state: z.string().optional(),
  }),
});

type PRReviewExtractionPayload = z.infer<typeof PRReviewExtractionPayloadSchema>;

export class PRReviewExtraction extends BaseAutomation<PRReviewExtractionPayload> {
  static readonly metadata: AutomationMetadata = {
    key: 'pr-review-extraction',
    domain: 'pr',
    description: 'Extracts submitted review comments into a triage-friendly summary link.',
    events: ['pull_request_review'],
    alwaysOn: false,
    authPolicy: 'app',
  };

  async shouldRun(): Promise<boolean> {
    if (this.eventName !== 'pull_request_review' || this.action !== 'submitted') {
      return false;
    }

    const parsed = PRReviewExtractionPayloadSchema.safeParse(this.payload);
    return parsed.success && parsed.data.review.state !== 'approved';
  }

  async run(): Promise<void> {
    const payload = PRReviewExtractionPayloadSchema.parse(this.payload);
    const origin = new URL(this.octokitRequestContext.req.url).origin;

    try {
      await extractReviewCommentsAndPostReply(
        this.env,
        payload.repository.owner.login,
        payload.repository.name,
        payload.pull_request.number,
        origin,
        await this.getGitHubClient(),
      );

      await this.logExecution(
        'success',
        'Extracted review comments and posted summary link.',
        payload.pull_request.number,
      );
    } catch (error) {
      await this.logExecution(
        'failure',
        `PR review extraction failed: ${error instanceof Error ? error.message : String(error)}`,
        payload.pull_request.number,
      );
      throw error;
    }
  }
}
