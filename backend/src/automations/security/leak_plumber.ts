import { z } from 'zod';
import { BaseAutomation, type AutomationMetadata } from '@/core/BaseAutomation';
import { runLeakPlumberWorkflow, shouldRunLeakPlumber } from './leak_plumber/workflow';

const LeakPlumberPayloadSchema = z.object({
  action: z.string(),
  repository: z.object({
    name: z.string(),
    full_name: z.string(),
    private: z.boolean(),
    owner: z.object({
      login: z.string(),
    }),
  }),
  installation: z.object({
    id: z.number(),
  }),
  changes: z
    .object({
      private: z
        .object({
          from: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
});

type LeakPlumberPayload = z.infer<typeof LeakPlumberPayloadSchema>;

export class LeakPlumber extends BaseAutomation<LeakPlumberPayload> {
  static readonly metadata: AutomationMetadata = {
    key: 'leak-plumber',
    domain: 'security',
    description: 'Scans newly public repositories for leaked secrets and remediates exposure.',
    events: ['repository'],
    alwaysOn: false,
    authPolicy: 'app',
  };

  async shouldRun(): Promise<boolean> {
    if (this.eventName !== 'repository') {
      return false;
    }

    const parsed = LeakPlumberPayloadSchema.safeParse(this.payload);
    return parsed.success && shouldRunLeakPlumber(parsed.data);
  }

  async run(): Promise<void> {
    const payload = LeakPlumberPayloadSchema.parse(this.payload);

    try {
      await runLeakPlumberWorkflow({
        env: this.env,
        payload,
      });
      await this.logExecution('success', 'LeakPlumber completed secret exposure scan.');
    } catch (error) {
      await this.logExecution(
        'failure',
        `LeakPlumber failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
