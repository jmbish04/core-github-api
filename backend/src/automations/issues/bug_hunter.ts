import { z } from 'zod';
import { BaseAutomation, type AutomationMetadata } from '@/core/BaseAutomation';
import { runBugHunterWorkflow, shouldRunBugHunter } from './bug_hunter/workflow';

const BugHunterPayloadSchema = z.object({
  action: z.string(),
  repository: z.object({
    name: z.string(),
    owner: z.object({
      login: z.string(),
    }),
  }),
  issue: z.object({
    number: z.number(),
    labels: z.array(
      z.union([
        z.string(),
        z.object({
          name: z.string().optional(),
        }),
      ]),
    ),
  }),
  installation: z.object({
    id: z.number(),
  }),
});

type BugHunterPayload = z.infer<typeof BugHunterPayloadSchema>;

export class BugHunter extends BaseAutomation<BugHunterPayload> {
  static readonly metadata: AutomationMetadata = {
    key: 'bug-hunter',
    domain: 'issues',
    description: 'Generates a sandboxed reproduction test for newly opened bug issues.',
    events: ['issues'],
    alwaysOn: false,
    authPolicy: 'app',
  };

  async shouldRun(): Promise<boolean> {
    if (this.eventName !== 'issues') {
      return false;
    }

    const parsed = BugHunterPayloadSchema.safeParse(this.payload);
    return parsed.success && shouldRunBugHunter(parsed.data);
  }

  async run(): Promise<void> {
    const payload = BugHunterPayloadSchema.parse(this.payload);

    try {
      await runBugHunterWorkflow({
        env: this.env,
        payload,
        deliveryId: this.deliveryId,
      });
      await this.logExecution('success', 'BugHunter workflow completed.', payload.issue.number);
    } catch (error) {
      await this.logExecution(
        'failure',
        `BugHunter failed: ${error instanceof Error ? error.message : String(error)}`,
        payload.issue.number,
      );
      throw error;
    }
  }
}
