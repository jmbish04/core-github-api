import { z } from 'zod';
import { BaseAutomation, type AutomationMetadata } from '@/core/BaseAutomation';
import { JulesService } from '@/services/jules/jules';
import { JULES_STANDARDS } from '@/config/jules-standards';

const JulesStandardsPushPayloadSchema = z.object({
  ref: z.string(),
  repository: z.object({
    default_branch: z.string(),
    full_name: z.string(),
    name: z.string(),
    owner: z.object({
      login: z.string(),
    }),
  }),
});

type JulesStandardsPushPayload = z.infer<typeof JulesStandardsPushPayloadSchema>;

export class JulesStandardsPush extends BaseAutomation<JulesStandardsPushPayload> {
  static readonly metadata: AutomationMetadata = {
    key: 'jules-standards-push',
    domain: 'push',
    description: 'Asks Jules to analyze default-branch pushes for standards compliance.',
    events: ['push'],
    alwaysOn: false,
    authPolicy: 'app',
  };

  async shouldRun(): Promise<boolean> {
    if (this.eventName !== 'push') {
      return false;
    }

    const parsed = JulesStandardsPushPayloadSchema.safeParse(this.payload);
    return (
      parsed.success &&
      parsed.data.ref === `refs/heads/${parsed.data.repository.default_branch}`
    );
  }

  async run(): Promise<void> {
    const payload = JulesStandardsPushPayloadSchema.parse(this.payload);

    try {
      const julesService = JulesService.getInstance(this.env);
      await julesService.startSession({
        prompt: `New Push detected to ${payload.repository.full_name}. Analyze this push for standards compliance.\n\n${JULES_STANDARDS}`,
        repo: {
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
          branch: payload.repository.default_branch,
        },
      });

      await this.logExecution('success', 'Queued Jules standards analysis for push.');
    } catch (error) {
      await this.logExecution(
        'failure',
        `Jules standards push failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
