import { BaseAutomation } from '@/core/BaseAutomation';
import { runBugHunterWorkflow, shouldRunBugHunter } from "@/routes/api/webhooks/workflows/bug-hunter";

export class BugHunter extends BaseAutomation {
  private deliveryId: string;

  constructor(env: Env, payload: unknown, installationId: number | undefined, usePat: boolean, deliveryId: string) {
    super(env, payload, installationId, usePat);
    this.deliveryId = deliveryId;
  }

  async shouldExecute(): Promise<boolean> {
    return shouldRunBugHunter(this.payload);
  }

  async execute(): Promise<void> {
    try {
      await runBugHunterWorkflow({
        env: this.env,
        payload: this.payload,
        deliveryId: this.deliveryId,
      });
      await this.logExecution('success', 'BugHunter workflow dispatched');
    } catch (error: unknown) {
      console.error('[BugHunter] Workflow failed:', error);
      await this.logExecution('failure', `BugHunter failed: ${error.message}`);
    }
  }
}
