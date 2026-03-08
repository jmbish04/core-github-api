import { BaseAutomation } from '@/core/BaseAutomation';
import { ensureRepositoryFromWebhook } from "@/services/repository-sync";
import { StandardizationService } from "@/services/standardization";

export class RepoSync extends BaseAutomation {
  async shouldExecute(): Promise<boolean> {
    return !!this.payload.repository;
  }

  async execute(): Promise<void> {
    try {
      await ensureRepositoryFromWebhook(this.env, this.payload.repository);
      await StandardizationService.enforce(this.env, this.payload.repository);
      await this.logExecution('success', 'Repo sync and standards enforced');
    } catch (e: unknown) {
      console.error('[RepoSync] failed', e);
      await this.logExecution('failure', `RepoSync failed: ${e.message}`);
    }
  }
}
