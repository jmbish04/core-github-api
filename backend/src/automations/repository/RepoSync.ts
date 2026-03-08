import { BaseAutomation } from '@/core/BaseAutomation';
import { ensureRepositoryFromWebhook } from "@/services/repository-sync";
import { StandardizationService } from "@/services/standardization";

type RepoSyncPayload = {
  repository?: Parameters<typeof ensureRepositoryFromWebhook>[1];
};

export class RepoSync extends BaseAutomation<RepoSyncPayload> {
  async shouldExecute(): Promise<boolean> {
    return !!this.payload.repository;
  }

  async execute(): Promise<void> {
    try {
      const repository = this.payload.repository;
      if (!repository?.owner?.login || !repository.name) {
        await this.logExecution('skipped', 'Repository payload was incomplete for repo sync');
        return;
      }

      await ensureRepositoryFromWebhook(this.env, repository);
      await StandardizationService.enforce(this.env, {
        owner: { login: repository.owner.login },
        name: repository.name,
      });
      await this.logExecution('success', 'Repo sync and standards enforced');
    } catch (e: unknown) {
      console.error('[RepoSync] failed', e);
      await this.logExecution('failure', `RepoSync failed: ${this.getErrorMessage(e)}`);
    }
  }
}
