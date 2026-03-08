import { BaseAutomation } from '@/core/BaseAutomation';
import type { Context } from 'hono';

type PullRequestReviewPayload = {
  action?: string;
  review?: { state?: string };
  repository: { owner: { login: string }; name: string };
  pull_request: { number: number };
};

export class PRReviewExtraction extends BaseAutomation<PullRequestReviewPayload> {
  private c: Context<{ Bindings: Env }>;

  constructor(env: Env, payload: PullRequestReviewPayload, installationId: number | undefined, usePat: boolean, deliveryId: string, c: Context<{ Bindings: Env }>) {
    super(env, payload, installationId, usePat);
    this.c = c;
  }

  async shouldExecute(): Promise<boolean> {
    return this.payload.action === 'submitted' && this.payload.review?.state !== 'approved';
  }

  async execute(): Promise<void> {
    try {
      const origin = new URL(this.c.req.url).origin;
      const m = await import('@services/github/pr-ingestion');
      await m.extractReviewCommentsAndPostReply(
        this.env, 
        this.payload.repository.owner.login, 
        this.payload.repository.name, 
        this.payload.pull_request.number, 
        origin
      );
      await this.logExecution('success', 'Review comments extracted and queued for bot intervention', this.payload.pull_request.number);
    } catch (e: unknown) {
      console.error('[PRReviewExtraction] failed:', e);
      await this.logExecution('failure', `Extraction failed: ${this.getErrorMessage(e)}`, this.payload.pull_request?.number);
    }
  }
}
