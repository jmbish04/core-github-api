import { z } from 'zod';
import { BaseAutomation, type AutomationMetadata } from '@/core/BaseAutomation';
import { ensureRepositoryFromWebhook } from '@/services/repository-sync';

const RepoSyncPayloadSchema = z.object({
  repository: z.object({
    name: z.string().optional(),
    full_name: z.string().optional(),
    description: z.string().nullable().optional(),
    owner: z
      .object({
        login: z.string().optional(),
      })
      .optional(),
  }),
});

type RepoSyncPayload = z.infer<typeof RepoSyncPayloadSchema>;

export class RepoSync extends BaseAutomation<RepoSyncPayload> {
  static readonly metadata: AutomationMetadata = {
    key: 'repo-sync',
    domain: 'repository',
    description: 'Keeps internal repository/project records aligned with GitHub webhook payloads.',
    events: ['repository', 'push', 'pull_request', 'issues', 'issue_comment', 'check_run'],
    alwaysOn: true,
    authPolicy: 'app',
  };

  async shouldRun(): Promise<boolean> {
    return RepoSyncPayloadSchema.safeParse(this.payload).success;
  }

  async run(): Promise<void> {
    const payload = RepoSyncPayloadSchema.parse(this.payload);

    try {
      const result = await ensureRepositoryFromWebhook(this.env, payload.repository);
      if (result.skipped) {
        await this.logExecution('skipped', 'Repository was outside the configured owner scope.');
        return;
      }

      await this.logExecution(
        'success',
        result.projectCreated
          ? 'Repository and project records synchronized.'
          : 'Repository record synchronized.',
      );
    } catch (error) {
      await this.logExecution(
        'failure',
        `Repository sync failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
