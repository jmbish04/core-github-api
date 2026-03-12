import { z } from 'zod';
import { BaseAutomation, type AutomationMetadata } from '@/automations/core/BaseAutomation';
import { applySyncManifestToBranch, buildSyncManifest } from '@/automations/push/orchestration/sync';
import { McpSync } from './mcp';
import { RulesStandardization } from './rules';
import { SecretSync } from './secrets';
import { ensureRepositorySpecialist } from './specialist';

const RepoStandardizationPayloadSchema = z.object({
  action: z.string().optional(),
  repository: z.object({
    name: z.string(),
    full_name: z.string().optional(),
    default_branch: z.string().optional().default('main'),
    owner: z.object({
      login: z.string(),
    }),
  }),
});

type RepoStandardizationPayload = z.infer<typeof RepoStandardizationPayloadSchema>;

export async function enforceRepositoryStandardization(
  env: Env,
  repository: { owner: { login: string }; name: string; default_branch?: string },
  octokit: any,
): Promise<void> {
  await RulesStandardization.enforce(env, repository, octokit);
  await ensureRepositorySpecialist(env, repository.owner.login, repository.name, octokit);
  await McpSync.syncMcpConfig(env, repository.owner.login, repository.name, octokit);
  await SecretSync.autoProvisionSecrets(env, repository.owner.login, repository.name, octokit);
}

async function bootstrapSyncAssets(
  env: Env,
  octokit: any,
  payload: RepoStandardizationPayload,
): Promise<void> {
  const manifest = await buildSyncManifest(env, octokit, {
    owner: payload.repository.owner.login,
    name: payload.repository.name,
    defaultBranch: payload.repository.default_branch,
  });

  await applySyncManifestToBranch(
    octokit,
    {
      owner: payload.repository.owner.login,
      name: payload.repository.name,
      defaultBranch: payload.repository.default_branch,
    },
    payload.repository.default_branch,
    manifest,
  );
}

export class RepoStandardization extends BaseAutomation<RepoStandardizationPayload> {
  static readonly metadata: AutomationMetadata = {
    key: 'repo-standardization',
    domain: 'repository',
    description: 'Bootstraps and enforces repository-wide standardization artifacts.',
    events: ['repository'],
    alwaysOn: false,
    authPolicy: 'app',
  };

  async shouldRun(): Promise<boolean> {
    return (
      this.eventName === 'repository' &&
      RepoStandardizationPayloadSchema.safeParse(this.payload).success
    );
  }

  async run(): Promise<void> {
    const payload = RepoStandardizationPayloadSchema.parse(this.payload);

    try {
      const octokit = await this.getGitHubClient();
      await enforceRepositoryStandardization(
        this.env,
        {
          owner: { login: payload.repository.owner.login },
          name: payload.repository.name,
          default_branch: payload.repository.default_branch,
        },
        octokit,
      );

      if (this.action === 'created') {
        await bootstrapSyncAssets(this.env, octokit, payload);
      }

      await this.logExecution('success', 'Repository standardization completed.');
    } catch (error) {
      await this.logExecution(
        'failure',
        `Repository standardization failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
