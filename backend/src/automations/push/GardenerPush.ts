import { BaseAutomation } from '@/core/BaseAutomation';
import type { GitHubPushPayload } from '@/types/github/webhooks';
import { GardenerOrchestrator } from "@/routes/api/webhooks/workflows/gardener";
import { withCompatOctokit } from "@/services/octokit/compat";
import type { Context } from 'hono';

export class GardenerPush extends BaseAutomation<GitHubPushPayload> {
  private c: Context<{ Bindings: Env }>; // We need context for Gardener until it's fully decoupled.

  constructor(env: Env, payload: GitHubPushPayload, installationId: number | undefined, usePat: boolean, deliveryId: string, c: Context<{ Bindings: Env }>) {
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
      await this.logExecution('failure', `Gardener failed: ${this.getErrorMessage(err)}`);
    }
  }
}
