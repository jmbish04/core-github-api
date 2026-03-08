import { BaseAutomation } from '@/core/BaseAutomation';
import { GardenerOrchestrator } from "@/routes/api/webhooks/workflows/gardener";
import { withCompatOctokit } from "@/services/octokit/compat";

export class GardenerPush extends BaseAutomation {
  private c: unknown; // We need context for Gardener until it's fully decoupled.

  constructor(env: Env, payload: unknown, installationId: number | undefined, usePat: boolean, deliveryId: string, c: unknown) {
    super(env, payload, installationId, usePat);
    this.c = c;
  }

  async shouldExecute(): Promise<boolean> {
    return this.payload.ref === `refs/heads/${this.payload.repository?.default_branch}`;
  }

  async execute(): Promise<void> {
    try {
      const octokit = withCompatOctokit(await this.getGitHubClient());
      await GardenerOrchestrator.handlePushEvent(this.c, octokit, this.payload);
      await this.logExecution('success', 'Gardener auto-formatting launched');
    } catch (err: unknown) {
      console.error('[Gardener] Failed to launch:', err);
      await this.logExecution('failure', `Gardener failed: ${err.message}`);
    }
  }
}
