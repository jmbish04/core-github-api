import { BaseAutomation } from '@/core/BaseAutomation';

export class StatsUpdate extends BaseAutomation {
  async shouldExecute(): Promise<boolean> {
    return !!this.payload.repository;
  }

  async execute(): Promise<void> {
    try {
      const m = await import('@services/stats-updater');
      await m.updateRepoStats(this.env, this.payload.repository.owner.login, this.payload.repository.name);
      // Not logging execution to automationLogs because this is a core quiet telemetry step, but we can if desired.
    } catch (e: unknown) {
      console.error('[StatsUpdate] failed', e);
      // await this.logExecution('failure', `StatsUpdate failed: ${e.message}`);
    }
  }
}
