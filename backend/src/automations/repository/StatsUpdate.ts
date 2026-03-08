import { BaseAutomation } from '@/core/BaseAutomation';

type StatsUpdatePayload = {
  repository?: {
    owner?: { login?: string };
    name?: string;
  };
};

export class StatsUpdate extends BaseAutomation<StatsUpdatePayload> {
  async shouldExecute(): Promise<boolean> {
    return !!this.payload.repository;
  }

  async execute(): Promise<void> {
    try {
      const owner = this.payload.repository?.owner?.login;
      const repo = this.payload.repository?.name;
      if (!owner || !repo) {
        return;
      }

      const m = await import('@services/stats-updater');
      await m.updateRepoStats(this.env, owner, repo);
      // Not logging execution to automationLogs because this is a core quiet telemetry step, but we can if desired.
    } catch (e: unknown) {
      console.error('[StatsUpdate] failed', e);
      // await this.logExecution('failure', `StatsUpdate failed: ${e.message}`);
    }
  }
}
