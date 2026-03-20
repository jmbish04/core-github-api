import { z } from 'zod';
import { BaseAutomation, type AutomationMetadata } from '@/automations/core/BaseAutomation';
import { GardenerOrchestrator } from '@/automations/push/orchestration';

const GardenerPushPayloadSchema = z.object({
  ref: z.string(),
  repository: z.object({
    default_branch: z.string(),
    full_name: z.string(),
    name: z.string(),
    owner: z.object({
      login: z.string(),
    }),
  }),
  installation: z.object({
    id: z.number(),
  }),
});

type GardenerPushPayload = z.infer<typeof GardenerPushPayloadSchema>;

export class GardenerPush extends BaseAutomation<GardenerPushPayload> {
  static readonly metadata: AutomationMetadata = {
    key: 'gardener-push',
    domain: 'push',
    description: 'Runs repository hygiene checks and standardization tasks on default-branch pushes.',
    events: ['push'],
    alwaysOn: false,
    authPolicy: 'app',
  };

  async shouldRun(): Promise<boolean> {
    if (this.eventName !== 'push') {
      return false;
    }

    const parsed = GardenerPushPayloadSchema.safeParse(this.payload);
    return parsed.success && parsed.data.ref === `refs/heads/${parsed.data.repository.default_branch}`;
  }

  async run(): Promise<void> {
    const payload = GardenerPushPayloadSchema.parse(this.payload);

    try {
      await GardenerOrchestrator.handlePushEvent(
        this.octokitRequestContext,
        await this.getGitHubClient(),
        payload,
      );
      await this.logExecution('success', 'Completed Gardener push orchestration.');
    } catch (error) {
      await this.logExecution(
        'failure',
        `Gardener push failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
