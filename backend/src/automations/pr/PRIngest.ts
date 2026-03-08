import { BaseAutomation } from '@/core/BaseAutomation';

export class PRIngest extends BaseAutomation {
  private eventName: string;

  constructor(env: Env, payload: unknown, installationId: number | undefined, usePat: boolean, deliveryId: string, eventName: string) {
    super(env, payload, installationId, usePat);
    this.eventName = eventName;
  }

  async shouldExecute(): Promise<boolean> {
    return this.eventName === 'pull_request';
  }

  async execute(): Promise<void> {
    try {
      const m = await import('@services/github/pr-ingestion');
      await m.processPullRequestEvent(this.env, this.payload);
    } catch (e: unknown) {
      console.error('[PRIngest] failed:', e);
      await this.logExecution('failure', `PRIngest failed: ${e.message}`, this.payload.pull_request?.number);
    }
  }
}
