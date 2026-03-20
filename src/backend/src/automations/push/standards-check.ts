import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@db';
import { repositories } from '@/db/schemas/github/repos';
import { BaseAutomation, type AutomationMetadata } from '@/automations/core/BaseAutomation';
import { resolveAutomationRunnerPolicy } from './runner-policies';
import { dispatchStandardsCheck } from './standards-dispatcher';

const StandardsCheckPushPayloadSchema = z.object({
  ref: z.string(),
  after: z.string(),
  repository: z.object({
    default_branch: z.string(),
    full_name: z.string(),
    name: z.string(),
    description: z.string().nullable().optional(),
    owner: z.object({
      login: z.string(),
    }),
  }),
});

type StandardsCheckPushPayload = z.infer<typeof StandardsCheckPushPayloadSchema>;

export class StandardsCheckPush extends BaseAutomation<StandardsCheckPushPayload> {
  static readonly metadata: AutomationMetadata = {
    key: 'standards-check-push',
    domain: 'push',
    description: 'Routes default-branch push standards checks through the configured runner policy.',
    events: ['push'],
    alwaysOn: false,
    authPolicy: 'app',
  };

  async shouldRun(): Promise<boolean> {
    if (this.eventName !== 'push') {
      return false;
    }

    const parsed = StandardsCheckPushPayloadSchema.safeParse(this.payload);
    return (
      parsed.success &&
      parsed.data.ref === `refs/heads/${parsed.data.repository.default_branch}`
    );
  }

  async run(): Promise<void> {
    const payload = StandardsCheckPushPayloadSchema.parse(this.payload);
    const db = getDb(this.env.DB);
    const [repoRecord] = await db
      .select({ infrastructure: repositories.infrastructure })
      .from(repositories)
      .where(
        and(
          eq(repositories.owner, payload.repository.owner.login),
          eq(repositories.name, payload.repository.name),
        ),
      )
      .limit(1);

    const policy = await resolveAutomationRunnerPolicy(this.env, {
      automationKey: StandardsCheckPush.metadata.key,
      triggerEvent: this.eventName,
      ref: payload.ref,
      repoOwner: payload.repository.owner.login,
      repoName: payload.repository.name,
      infrastructure: repoRecord?.infrastructure || null,
    });

    try {
      const result = await dispatchStandardsCheck({
        env: this.env,
        appOctokit: await this.getGitHubClient(),
        patToken: policy.runnerKind === 'github_assignment' ? await this.getPatToken() : undefined,
        policy,
        repository: {
          owner: payload.repository.owner.login,
          name: payload.repository.name,
          fullName: payload.repository.full_name,
          defaultBranch: payload.repository.default_branch,
          description: payload.repository.description || null,
          infrastructure: repoRecord?.infrastructure || null,
        },
        payload: {
          ref: payload.ref,
          after: payload.after,
        },
      });

      await this.logExecution('success', `${result} Runner: ${policy.runnerKind}.`);
    } catch (error) {
      await this.logExecution(
        'failure',
        `Push standards check failed via ${policy.runnerKind}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
